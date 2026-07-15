import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@duckdb/duckdb-wasm', () => ({}))

const mockQuery = vi.fn()
const mockConn = {
  query: mockQuery,
} as unknown as import('@duckdb/duckdb-wasm').AsyncDuckDBConnection

import { getFilteredSlice, updateCell, getDistinctValues } from './tableOperations'

describe('getFilteredSlice SQL builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ toArray: () => [{ cnt: 10 }] })
      }
      return Promise.resolve({
        toArray: () => [{ Name: 'Alice', Age: 30 }],
      })
    })
  })

  it('builds correct SQL for equals filter', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Name', operator: 'equals', value: 'Alice', columnType: 'string' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('LOWER(CAST("Name" AS VARCHAR)) =')
    expect(dataSql).toContain("'alice'")
    expect(dataSql).toContain('LIMIT 50 OFFSET 0')
  })

  it('escapes SQL injection in filter values', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Name', operator: 'contains', value: "'; DROP TABLE users; --", columnType: 'string' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain("''; drop table users; --'")
    expect(dataSql).not.toContain("'; DROP TABLE")
  })

  it('builds BETWEEN clause for number filters', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Age', operator: 'between', value: 18, value2: 65, columnType: 'number' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('"Age" >= 18 AND "Age" <= 65')
  })

  it('handles multi-select enum filter (contains with |||)', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Status', operator: 'contains', value: 'active|||pending', columnType: 'string' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('LOWER(CAST("Status" AS VARCHAR)) =')
    expect(dataSql).toContain("'active'")
    expect(dataSql).toContain("'pending'")
    expect(dataSql).toContain(' OR ')
  })

  it('builds ORDER BY clause for sorts', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      undefined,
      [{ column: 'Age', direction: 'desc' }],
      undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('ORDER BY "Age" DESC')
  })

  it('builds search clause across all columns', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ toArray: () => [{ cnt: 5 }] })
      }
      if (sql.includes('DESCRIBE')) {
        return Promise.resolve({
          toArray: () => [
            { column_name: 'Name' },
            { column_name: 'Age' },
          ],
        })
      }
      return Promise.resolve({ toArray: () => [] })
    })

    await getFilteredSlice(
      mockConn, 'test_table',
      undefined, undefined, 'hello', 0, 50
    )

    const describeCalled = mockQuery.mock.calls.some(
      (call) => (call[0] as string).includes('DESCRIBE')
    )
    expect(describeCalled).toBe(true)

    const dataSql = mockQuery.mock.calls.find(
      (call) => (call[0] as string).includes('LIKE')
    )
    expect(dataSql).toBeDefined()
  })

  it('applies LIMIT and OFFSET correctly', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      undefined, undefined, undefined, 500, 100
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('LIMIT 100 OFFSET 500')
  })

  it('handles is_null operator', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Name', operator: 'is_null', columnType: 'string' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('"Name" IS NULL')
  })

  it('ignores an incomplete date filter instead of casting an empty value', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Date', operator: 'equals', value: '', columnType: 'date' }],
      undefined, undefined, 0, 50
    )

    expect(mockQuery).toHaveBeenCalledTimes(2)
    for (const [sql] of mockQuery.mock.calls) {
      expect(sql).not.toContain('WHERE')
      expect(sql).not.toContain("CAST('' AS DATE)")
    }
  })

  it('uses non-throwing date casts for persisted malformed values', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Date', operator: 'equals', value: 'not-a-date', columnType: 'date' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).toContain('TRY_CAST')
    expect(dataSql).toContain("'not-a-date'")
  })

  it('ignores a partial between filter', async () => {
    await getFilteredSlice(
      mockConn, 'test_table',
      [{ column: 'Date', operator: 'between', value: '2026-01-01', value2: '', columnType: 'date' }],
      undefined, undefined, 0, 50
    )

    const dataSql = mockQuery.mock.calls[1][0] as string
    expect(dataSql).not.toContain('WHERE')
  })
})

describe('updateCell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ toArray: () => [] })
  })

  it('executes UPDATE with correct SQL', async () => {
    await updateCell(mockConn, 'test_table', 'row_5', 'Name', 'NewValue', 'string')

    const sql = mockQuery.mock.calls[0][0] as string
    expect(sql).toContain('UPDATE "test_table"')
    expect(sql).toContain('SET "Name" =')
    expect(sql).toContain("'NewValue'")
    expect(sql).toContain('"__tablecanvas_internal_row_id_7f3a__" = \'row_5\'')
  })

  it('handles numeric values', async () => {
    await updateCell(mockConn, 'test_table', 'row_3', 'Age', 42, 'number')

    const sql = mockQuery.mock.calls[0][0] as string
    expect(sql).toContain('SET "Age" = 42')
  })

  it('handles null values', async () => {
    await updateCell(mockConn, 'test_table', 'row_3', 'Name', null, 'string')

    const sql = mockQuery.mock.calls[0][0] as string
    expect(sql).toContain('SET "Name" = NULL')
  })
})

describe('getDistinctValues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({
      toArray: () => [{ val: 'A' }, { val: 'B' }, { val: 'C' }],
    })
  })

  it('returns distinct values with bounded limit', async () => {
    const result = await getDistinctValues(mockConn, 'test_table', 'Status', 50)

    const sql = mockQuery.mock.calls[0][0] as string
    expect(sql).toContain('SELECT DISTINCT "Status"')
    expect(sql).toContain('LIMIT 50')
    expect(result).toEqual(['A', 'B', 'C'])
  })
})

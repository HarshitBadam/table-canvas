import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsvBuffer, parseFileData, parseWorkbookSheet } from './fileParsers'

function csvBuffer(csv: string): ArrayBuffer {
  return new TextEncoder().encode(csv).buffer as ArrayBuffer
}

describe('file parsers', () => {
  it('infers and coerces CSV columns through the shared parser', async () => {
    const result = await parseCsvBuffer(csvBuffer([
      'Name,Amount,Active',
      'Alpha,"1,250",true',
      'Beta,42,false',
    ].join('\n')))

    expect(result.schema.columns.map((column) => column.type)).toEqual([
      'string',
      'number',
      'boolean',
    ])
    expect(result.rows[0]).toMatchObject({
      col_0_name: 'Alpha',
      col_1_amount: 1250,
      col_2_active: true,
    })
    expect(result.schema.columns.every((column) => column.duckDbName === undefined)).toBe(true)
  })

  it('uses the same inference and coercion for workbook sheets', () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Amount', 'Active'],
      ['Alpha', '1,250', 'true'],
      ['Beta', '42', 'false'],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data')

    const result = parseWorkbookSheet(workbook, 'Data')

    expect(result.schema.columns.map((column) => column.type)).toEqual([
      'string',
      'number',
      'boolean',
    ])
    expect(result.rows[1]).toMatchObject({
      col_0_name: 'Beta',
      col_1_amount: 42,
      col_2_active: false,
    })
  })

  it('preserves stable column IDs when materializing a saved schema', async () => {
    const result = await parseCsvBuffer(csvBuffer('Amount\n12'), {
      columns: [{
        id: 'amount_id',
        name: 'Amount',
        type: 'number',
        nullable: false,
      }],
      rowCount: 1,
    })

    expect(result.rows).toEqual([{ __rowId: 'row_0', amount_id: 12 }])
  })

  it('rehydrates renamed columns from their original imported header', async () => {
    const result = await parseCsvBuffer(csvBuffer('Amount\n12'), {
      columns: [{
        id: 'amount_id',
        name: 'Revenue',
        sourceName: 'Amount',
        type: 'number',
        nullable: false,
      }],
      rowCount: 1,
    })

    expect(result.rows).toEqual([{ __rowId: 'row_0', amount_id: 12 }])
  })

  it('rejects CSV rehydration when a persisted source header is missing', async () => {
    await expect(parseCsvBuffer(csvBuffer('Total,Region\n12,West'), {
      columns: [{
        id: 'amount_id',
        name: 'Revenue',
        sourceName: 'Amount',
        type: 'number',
        nullable: false,
      }],
      rowCount: 1,
    })).rejects.toThrow(
      'Missing persisted header: "Amount". Available headers: "Total", "Region".',
    )
  })

  it('rejects workbook rehydration when a persisted source header is missing', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Total', 'Region'], [12, 'West']]),
      'Data',
    )

    expect(() => parseWorkbookSheet(workbook, 'Data', {
      columns: [{
        id: 'amount_id',
        name: 'Revenue',
        sourceName: 'Amount',
        type: 'number',
        nullable: false,
      }],
      rowCount: 1,
    })).toThrow(
      'Missing persisted header: "Amount". Available headers: "Total", "Region".',
    )
  })

  it('allows user-added columns without a source header during rehydration', async () => {
    const result = await parseCsvBuffer(csvBuffer('Amount\n12'), {
      columns: [
        {
          id: 'amount_id',
          name: 'Amount',
          sourceName: 'Amount',
          type: 'number',
          nullable: false,
        },
        {
          id: 'notes_id',
          name: 'Notes',
          type: 'string',
          nullable: true,
        },
      ],
      rowCount: 1,
    })

    expect(result.rows).toEqual([{ __rowId: 'row_0', amount_id: 12 }])
  })

  it('preserves persisted physical-name metadata while rehydrating', async () => {
    const result = await parseCsvBuffer(csvBuffer('Amount\n12'), {
      columns: [{
        id: 'amount_id',
        name: 'Revenue',
        sourceName: 'Amount',
        duckDbName: 'legacy_physical_name',
        type: 'number',
        nullable: false,
      }],
      rowCount: 1,
    })

    expect(result.schema.columns[0].duckDbName).toBe('legacy_physical_name')
    expect(result.rows).toEqual([{ __rowId: 'row_0', amount_id: 12 }])
  })

  it('surfaces workbook parse failures instead of treating them as empty data', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Value'], [1]]),
      'Data',
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    await expect(parseFileData(buffer, 'xlsx', 'Missing')).rejects.toThrow(
      'Worksheet "Missing" was not found',
    )
  })
})

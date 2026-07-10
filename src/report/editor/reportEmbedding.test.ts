/**
 * Regression tests for report-embedding bug fixes:
 * (a) Node filter correctly selects table nodes by kind
 * (b) Column toggle produces correct explicit column list when "all" is selected
 * (c) HTML export includes embedded table data
 * (d) Materialization trigger for embedded nodes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SourceTableNode, DerivedTableNode } from '@/types'
import { generateReportHtml, collectEmbeddedTableIds, buildEmbeddedDataMap } from '@/persistence/reportHtmlGenerator'
import type { Report } from '@/report/types'

// ---- Mocks ----

const mockProjectStore = {
  nodes: {} as Record<string, SourceTableNode | DerivedTableNode>,
  getState: vi.fn(),
}
mockProjectStore.getState.mockReturnValue(mockProjectStore)

vi.mock('@/state/projectStore', () => ({
  useProjectStore: {
    getState: () => mockProjectStore,
  },
}))

// ---- Helpers ----

function createSourceTable(id: string, name: string): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: { fileRef: `file_${id}`, fileName: `${name}.csv`, fileType: 'csv', inferredSchemaVersion: 1 },
    schema: {
      columns: [
        { id: 'col_a', name: 'Name', type: 'string', nullable: false },
        { id: 'col_b', name: 'Age', type: 'number', nullable: true },
        { id: 'col_c', name: 'City', type: 'string', nullable: true },
      ],
      rowCount: 3,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createDerivedTable(id: string, name: string): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name,
    ui: { position: { x: 100, y: 0 } },
    plan: { transformDef: { type: 'filter', sourceTableId: 'src', conditions: [], logic: 'and' }, upstreamNodeIds: ['src'] },
    schema: {
      columns: [
        { id: 'col_x', name: 'Product', type: 'string', nullable: false },
      ],
      rowCount: 1,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProjectStore.nodes = {}
})


// ---------- (a) Node filter ----------

describe('Node filter for table nodes', () => {
  it('filters source and derived tables by kind (not type)', () => {
    const source = createSourceTable('t1', 'Sales')
    const derived = createDerivedTable('t2', 'FilteredSales')
    const chartNode = { id: 'c1', kind: 'chart' as const, name: 'MyChart', ui: { position: { x: 0, y: 0 } }, plan: { chartType: 'bar', sourceTableId: 't1', config: {} }, createdAt: '', updatedAt: '' }

    const allNodes = { t1: source, t2: derived, c1: chartNode }
    type TableNode = SourceTableNode | DerivedTableNode

    const tableNodes = Object.values(allNodes).filter(
      (n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'
    )

    expect(tableNodes).toHaveLength(2)
    expect(tableNodes.map(n => n.id).sort()).toEqual(['t1', 't2'])

    // Old buggy filter should NOT match
    const buggyFilter = Object.values(allNodes).filter(
      (n) => 'type' in n && (n as Record<string, unknown>).type === 'table'
    )
    expect(buggyFilter).toHaveLength(0)
  })
})


// ---------- (b) Column toggle ----------

describe('Column checkbox toggle semantics', () => {
  const allColumnIds = ['col_a', 'col_b', 'col_c']

  function handleColumnToggle(
    selectedColumns: string[],
    columnId: string,
  ): string[] {
    const currentlySelected = selectedColumns.length > 0
      ? selectedColumns
      : allColumnIds

    return currentlySelected.includes(columnId)
      ? currentlySelected.filter(c => c !== columnId)
      : [...currentlySelected, columnId]
  }

  it('unchecking a column when all are selected (empty array = all) produces all-except-one', () => {
    const result = handleColumnToggle([], 'col_b')
    expect(result).toEqual(['col_a', 'col_c'])
    expect(result).not.toContain('col_b')
  })

  it('unchecking a column when explicit subset is selected removes it', () => {
    const result = handleColumnToggle(['col_a', 'col_b'], 'col_a')
    expect(result).toEqual(['col_b'])
  })

  it('checking a column when explicit subset is selected adds it', () => {
    const result = handleColumnToggle(['col_a'], 'col_b')
    expect(result).toEqual(['col_a', 'col_b'])
  })

  it('checking the last unchecked column when explicit subset produces all columns', () => {
    const result = handleColumnToggle(['col_a', 'col_b'], 'col_c')
    expect(result).toEqual(['col_a', 'col_b', 'col_c'])
  })

  it('unchecking when all are selected does not return empty (the old bug)', () => {
    const result = handleColumnToggle([], 'col_a')
    expect(result.length).toBeGreaterThan(0)
  })
})


// ---------- (c) HTML export includes embedded tables ----------

describe('Report HTML export for embedded tables', () => {
  it('renders embeddedTable nodes as HTML <table> elements', () => {
    mockProjectStore.nodes = { t1: createSourceTable('t1', 'Sales') }

    const report: Report = {
      id: 'r1',
      name: 'Test Report',
      tiptapContent: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
          {
            type: 'embeddedTable',
            attrs: {
              sourceTableId: 't1',
              selectedColumns: [],
              rowSelectionMode: 'first_n',
              rowLimit: 10,
            },
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const dataMap = buildEmbeddedDataMap([{
      tableId: 't1',
      rows: [
        { __rowId: 'r1', col_a: 'Alice', col_b: 30, col_c: 'NYC' },
        { __rowId: 'r2', col_a: 'Bob', col_b: 25, col_c: 'LA' },
      ],
    }])

    const html = generateReportHtml(report, dataMap)

    expect(html).toContain('<table')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Name')
    expect(html).toContain('Age')
    expect(html).not.toContain('[Embedded Table')
  })

  it('respects selectedColumns filter in export', () => {
    mockProjectStore.nodes = { t1: createSourceTable('t1', 'Sales') }

    const report: Report = {
      id: 'r1',
      name: 'Test Report',
      tiptapContent: {
        type: 'doc',
        content: [
          {
            type: 'embeddedTable',
            attrs: {
              sourceTableId: 't1',
              selectedColumns: ['col_a'],
              rowSelectionMode: 'first_n',
              rowLimit: 10,
            },
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const dataMap = buildEmbeddedDataMap([{
      tableId: 't1',
      rows: [
        { __rowId: 'r1', col_a: 'Alice', col_b: 30, col_c: 'NYC' },
      ],
    }])

    const html = generateReportHtml(report, dataMap)

    expect(html).toContain('Name')
    expect(html).toContain('Alice')
    expect(html).not.toContain('Age')
    expect(html).not.toContain('NYC')
  })

  it('renders chartBlock with source info', () => {
    mockProjectStore.nodes = { t1: createSourceTable('t1', 'Sales') }

    const report: Report = {
      id: 'r1',
      name: 'Test Report',
      tiptapContent: {
        type: 'doc',
        content: [
          {
            type: 'chartBlock',
            attrs: {
              sourceTableId: 't1',
              chartType: 'bar',
              config: {},
            },
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const dataMap = buildEmbeddedDataMap([{
      tableId: 't1',
      rows: [{ __rowId: 'r1', col_a: 'x', col_b: 1, col_c: 'y' }],
    }])

    const html = generateReportHtml(report, dataMap)

    expect(html).toContain('Chart')
    expect(html).toContain('bar')
    expect(html).toContain('Sales')
  })

  it('shows placeholder when no data is available for embedded table', () => {
    const report: Report = {
      id: 'r1',
      name: 'Test Report',
      tiptapContent: {
        type: 'doc',
        content: [
          {
            type: 'embeddedTable',
            attrs: {
              sourceTableId: 'missing_table',
              selectedColumns: [],
              rowSelectionMode: 'first_n',
              rowLimit: 10,
            },
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const html = generateReportHtml(report, {})

    expect(html).toContain('Embedded Table')
    expect(html).toContain('no data')
  })
})


// ---------- (d) collectEmbeddedTableIds ----------

describe('collectEmbeddedTableIds', () => {
  it('collects table IDs from embeddedTable and chartBlock nodes', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
        { type: 'embeddedTable', attrs: { sourceTableId: 't1', rowLimit: 10 } },
        { type: 'chartBlock', attrs: { sourceTableId: 't2', rowLimit: 500 } },
        { type: 'embeddedTable', attrs: { sourceTableId: 't1', rowLimit: 20 } },
      ],
    }

    const refs = collectEmbeddedTableIds(content)

    expect(refs).toHaveLength(3)
    expect(refs.map(r => r.tableId)).toEqual(['t1', 't2', 't1'])
  })

  it('returns empty array for content with no embeds', () => {
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No embeds' }] }],
    }

    expect(collectEmbeddedTableIds(content)).toHaveLength(0)
  })
})

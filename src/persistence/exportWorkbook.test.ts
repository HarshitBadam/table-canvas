import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import type { ProjectNode, SourceTableNode } from '@/types'
import { parseWorkbookSheet, readWorkbook } from '@/engine/fileParsers'

vi.mock('@/engine/materializationService', () => ({
  getTableData: vi.fn(),
}))

import { getTableData } from '@/engine/materializationService'
import { createWorkbook } from './exportWorkbook'

const sampleWorkbookPath = resolve(process.cwd(), 'data/sample_workbook.xlsx')

describe('createWorkbook', () => {
  beforeEach(() => {
    vi.mocked(getTableData).mockResolvedValue({
      rows: [{ __rowId: 'row_0', amount: 12 }],
      totalRows: 1,
    })
  })

  it('exports evaluated values for computed columns', async () => {
    const node: ProjectNode = {
      id: 'table',
      kind: 'source_table',
      name: 'Table',
      ui: { position: { x: 0, y: 0 } },
      plan: {
        fileRef: '',
        fileName: '',
        fileType: 'csv',
        inferredSchemaVersion: 1,
        initialRows: [{ __rowId: 'row_0', amount: 12 }],
      },
      schema: {
        columns: [
          { id: 'amount', name: 'Amount', type: 'number', nullable: false },
          {
            id: 'double',
            name: 'Double',
            type: 'number',
            nullable: true,
            isComputed: true,
            formula: '[amount] * 2',
          },
        ],
        rowCount: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const buffer = await createWorkbook({ table: node })
    const workbook = XLSX.read(buffer!, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Table, {
      header: 1,
    })

    expect(rows[1]).toEqual([12, 24])
  })

  it.skipIf(!existsSync(sampleWorkbookPath))(
    'round-trips every sample workbook sheet without empty exports',
    async () => {
      const bytes = readFileSync(sampleWorkbookPath)
      const sourceWorkbook = readWorkbook(Uint8Array.from(bytes).buffer)
      const rowsByTableId = new Map<string, ReturnType<typeof parseWorkbookSheet>['rows']>()
      const nodes: Record<string, SourceTableNode> = {}

      sourceWorkbook.SheetNames.forEach((sheetName, index) => {
        const tableId = `sample-${index}`
        const parsed = parseWorkbookSheet(sourceWorkbook, sheetName)
        rowsByTableId.set(tableId, parsed.rows)
        nodes[tableId] = {
          id: tableId,
          kind: 'source_table',
          name: sheetName,
          ui: { position: { x: index * 20, y: index * 20 } },
          plan: {
            fileRef: 'sample-workbook',
            fileName: 'sample_workbook.xlsx',
            fileType: 'xlsx',
            sheetName,
            inferredSchemaVersion: 1,
          },
          schema: parsed.schema,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })
      vi.mocked(getTableData).mockImplementation(async (tableId) => {
        const rows = rowsByTableId.get(tableId) ?? []
        return { rows, totalRows: rows.length }
      })

      const exportedBuffer = await createWorkbook(nodes)
      const exportedWorkbook = XLSX.read(exportedBuffer!, { type: 'array' })

      expect(exportedWorkbook.SheetNames).toEqual(sourceWorkbook.SheetNames)
      exportedWorkbook.SheetNames.forEach((sheetName, index) => {
        const tableId = `sample-${index}`
        const rows = XLSX.utils.sheet_to_json<unknown[]>(
          exportedWorkbook.Sheets[sheetName],
          { header: 1 },
        )
        const sourceRows = rowsByTableId.get(tableId) ?? []
        expect(rows.length, `${sheetName} exported row count`).toBe(sourceRows.length + 1)
        expect(rows[0], `${sheetName} exported headers`).toEqual(
          nodes[tableId].schema!.columns.map((column) => column.name),
        )
        expect(rows[1]?.some((value) => value !== ''), `${sheetName} first data row`).toBe(true)
      })
    },
  )
})

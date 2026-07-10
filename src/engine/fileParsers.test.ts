import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsvBuffer, parseWorkbookSheet } from './fileParsers'

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
})

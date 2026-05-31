
export type CellValue = string | number | boolean | null

export interface Position {
  x: number
  y: number
}


export interface Patches {
  /** columnId -> rowId -> value */
  cellPatches: Record<string, Record<string, CellValue>>
  deletedRows: Set<string>
  insertedRows: InsertedRow[]
  /** "rowId:columnId" format for manual cell highlighting */
  highlightedCells?: Set<string>
}

export interface InsertedRow {
  rowId: string
  /** columnId -> value */
  values: Record<string, CellValue>
  insertedAt: number
}

export interface PatchOp {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}



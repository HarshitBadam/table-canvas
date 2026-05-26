
/** Value that can be stored in a cell */
export type CellValue = string | number | boolean | null

/** 2D position coordinates */
export interface Position {
  x: number
  y: number
}


/** Patches for tracking edits to source tables */
export interface Patches {
  /** columnId -> rowId -> value */
  cellPatches: Record<string, Record<string, CellValue>>
  /** Set of deleted row IDs */
  deletedRows: Set<string>
  /** Array of inserted rows */
  insertedRows: InsertedRow[]
  /** "rowId:columnId" format for manual cell highlighting */
  highlightedCells?: Set<string>
}

/** Represents a row that was inserted into a table */
export interface InsertedRow {
  rowId: string
  /** columnId -> value */
  values: Record<string, CellValue>
  /** Index where row was inserted */
  insertedAt: number
}

/** Single patch operation for cell-level changes */
export interface PatchOp {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}


import type { ProjectNode } from './node.types'
import type { Edge } from './transform.types'

/** Complete project state */
export interface ProjectState {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  createdAt: string
  updatedAt: string
}

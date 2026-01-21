/**
 * Repositories
 * 
 * Data access layer abstractions.
 */

export {
  TableRepository,
  createTableRepository,
} from './tableRepository'

export type {
  ITableRepository,
  TableData,
  MaterializationResult,
  LoadTableOptions,
  SavePatchesOptions,
} from './tableRepository'

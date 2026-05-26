/**
 * IndexedDB Persistence Layer
 *
 * Entry point that initializes the database and re-exports all storage operations.
 * Implementation is split across:
 *   - dbCore.ts          — schema, migration, getDB()
 *   - projectStorage.ts  — project CRUD
 *   - fileStorage.ts     — file blob CRUD
 *   - cacheStorage.ts    — computed cache CRUD
 *   - reportStorage.ts   — report CRUD
 *   - exportImport.ts    — project export/import with embedded files
 */

export { getDB } from './dbCore'
export type { TableCanvasDB, SerializedPatches } from './dbCore'

export { saveProject, loadProject, listProjects, deleteProject } from './projectStorage'
export type { StoredProject } from './projectStorage'

export { saveFile, loadFile, loadFileRecord, deleteFile } from './fileStorage'

export { saveCache, loadCache, clearTableCache } from './cacheStorage'

export { saveReport, loadReport, loadAllReports, listReports, deleteReport, saveAllReports } from './reportStorage'

export {
  exportProjectFile,
  parseImportFile,
  importProjectFile,
  importLegacyProjectFile,
} from './exportImport'
export type { ParsedImportData } from './exportImport'

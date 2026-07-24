export { getDB } from './dbCore'
export type { TableCanvasDB } from './dbCore'
export type { ProjectSyncOperation } from './dbCore'
export type { SerializedPatches } from './patchSerialization'
export {
  accountStorageScope,
  getStorageScope,
  GUEST_STORAGE_SCOPE,
  setStorageScope,
} from './storageScope'

export {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
} from './projectStorage'
export type { StoredProject } from './projectStorage'

export { saveFile, loadFile, loadFileRecord, deleteFile } from './fileStorage'

export {
  saveReport,
  loadReport,
  loadAllReports,
  loadReportsForProject,
  listReports,
  deleteReport,
  deleteReportsForProject,
  copyReportsToProject,
  replaceReportsForProject,
  saveAllReports,
} from './reportStorage'

export {
  acknowledgeProjectSave,
  clearProjectSyncOperation,
  enqueueProjectDelete,
  enqueueProjectSave,
  finalizeProjectDelete,
  getProjectSyncOperation,
  listProjectSyncOperations,
  saveProjectAndEnqueue,
} from './projectSyncQueue'

export {
  exportProjectFile,
  parseImportFile,
} from './exportImport'
export type { ParsedImportData } from './exportImport'

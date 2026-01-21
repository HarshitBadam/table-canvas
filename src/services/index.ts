/**
 * Services Module
 * 
 * Business logic services that orchestrate data operations,
 * transformations, and external integrations.
 */

// Re-export existing services
export { getEngine, EngineAdapter } from '@/engine';
export { ensureTableMaterialized, getTableData, needsMaterialization } from '@/engine/materializationService';

// Re-export API services (for direct backend calls)
export * from '@/api/auth.api';
export {
  serializePatches,
  deserializePatches,
  getProject,
  createProject,
  updateProject,
  patchProject,
  saveProjectState,
  // Note: listProjects and deleteProject are handled by syncService
} from '@/api/projects.api';
export {
  uploadFile,
  downloadFile,
  getFileAsArrayBuffer,
  getFileMetadata,
  // Note: listFiles and deleteFile are handled by syncService
} from '@/api/files.api';

// Re-export persistence services (preferred for synced operations)
export * from '@/persistence/syncService';
export * from '@/persistence/db';

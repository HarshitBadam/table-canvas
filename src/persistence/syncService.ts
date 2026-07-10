import { syncLocalProjectsToBackend } from './projectSync'

export {
  createProjectWithSync,
  deleteProjectWithSync,
  fetchProjects,
  importProjectWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
} from './projectSync'
export { syncLocalProjectsToBackend }
export type { ProjectWithSync } from './projectSync'
export {
  deleteFileWithSync,
  loadFileWithSync,
  uploadFileWithSync,
} from './fileSync'
export type { FileWithSync } from './fileSync'
export { getSyncStatus, isNetworkOnline } from './syncState'

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncLocalProjectsToBackend()
  })
}

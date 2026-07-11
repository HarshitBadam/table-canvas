import { syncLocalProjectsToBackend } from './projectSync'

export {
  createProjectWithSync,
  deleteProjectWithSync,
  fetchProjects,
  flushProjectSaveWithSync,
  importProjectWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
  syncLocalProjectsToBackend,
} from './projectSync'
export {
  deleteFileWithSync,
  loadFileWithSync,
  uploadFileWithSync,
} from './fileSync'

export { isNetworkOnline } from './syncState'

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncLocalProjectsToBackend()
  })
}

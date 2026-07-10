import { syncLocalProjectsToBackend } from './projectSync'

export {
  createProjectWithSync,
  deleteProjectWithSync,
  fetchProjects,
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

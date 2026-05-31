import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject as apiDeleteProject,
  ProjectSummary,
  serializePatches,
  deserializePatches,
} from '@/api/projects.api';
import {
  uploadFile,
  getFileAsArrayBuffer,
  deleteFile as apiDeleteFile,
} from '@/api/files.api';
import {
  saveProject as saveProjectLocal,
  loadProject as loadProjectLocal,
  listProjects as listProjectsLocal,
  deleteProject as deleteProjectLocal,
  saveFile as saveFileLocal,
  loadFile as loadFileLocal,
  deleteFile as deleteFileLocal,
} from './db';
import type { ProjectNode, Edge, Patches } from '@/types';


interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
}

export interface ProjectWithSync {
  id: string;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, Patches>;
  isLocalOnly?: boolean;
  needsSync?: boolean;
}


let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncedAt: null,
  error: null,
};

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
  });
  window.addEventListener('offline', () => {
    isOnline = false;
  });
}



export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isOnline) {
    try {
      const projects = await listProjects();
      return projects;
    } catch (error) {
      console.error('[syncService] Failed to fetch projects from backend:', error);
      // Fallback to local storage
    }
  }
  
  const localProjects = await listProjectsLocal();
  return localProjects.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: new Date(p.updatedAt),
    createdAt: new Date(p.updatedAt), // Local doesn't track createdAt separately
  }));
}

export async function loadProjectWithSync(projectId: string): Promise<ProjectWithSync | null> {
  if (isOnline) {
    try {
      const project = await getProject(projectId);
      
      await saveProjectLocal(
        project.id,
        project.name,
        project.nodes,
        project.edges,
        deserializePatches(project.patches)
      );
      
      return {
        id: project.id,
        name: project.name,
        nodes: project.nodes,
        edges: project.edges,
        patches: deserializePatches(project.patches),
        isLocalOnly: false,
        needsSync: false,
      };
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error);
      // Fallback to local storage
    }
  }
  
  const localProject = await loadProjectLocal(projectId);
  if (!localProject) return null;
  
  return {
    id: localProject.id,
    name: localProject.name,
    nodes: localProject.nodes,
    edges: localProject.edges,
    patches: deserializePatches(localProject.patches),
    isLocalOnly: !isOnline,
    needsSync: !isOnline,
  };
}

export async function createProjectWithSync(name?: string): Promise<ProjectWithSync> {
  const defaultName = name || 'Untitled Project';
  
  if (isOnline) {
    try {
      const project = await createProject({ name: defaultName });
      
      await saveProjectLocal(
        project.id,
        project.name,
        project.nodes,
        project.edges,
        deserializePatches(project.patches)
      );
      
      return {
        id: project.id,
        name: project.name,
        nodes: project.nodes,
        edges: project.edges,
        patches: deserializePatches(project.patches),
        isLocalOnly: false,
        needsSync: false,
      };
    } catch (error) {
      console.error('[syncService] Failed to create project on backend:', error);
      // Fallback to local-only project
    }
  }
  
  const localId = `local_${Date.now()}`;
  const project: ProjectWithSync = {
    id: localId,
    name: defaultName,
    nodes: {},
    edges: {},
    patches: {},
    isLocalOnly: true,
    needsSync: true,
  };
  
  await saveProjectLocal(
    project.id,
    project.name,
    project.nodes,
    project.edges,
    project.patches
  );
  
  return project;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

async function saveToBackendImpl(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>
): Promise<void> {
  if (!isOnline || projectId.startsWith('local_')) {
    return;
  }
  
  syncStatus = { ...syncStatus, isSyncing: true, error: null };
  
  try {
    await updateProject(projectId, {
      name,
      nodes,
      edges,
      patches: serializePatches(patches),
    });
    
    syncStatus = {
      isSyncing: false,
      lastSyncedAt: new Date(),
      error: null,
    };
  } catch (error) {
    console.error('[Sync] Failed to save to backend:', error);
    syncStatus = {
      isSyncing: false,
      lastSyncedAt: syncStatus.lastSyncedAt,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

function saveToBackend(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>
): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveToBackendImpl(projectId, name, nodes, edges, patches);
  }, 2000);
}

export async function saveProjectWithSync(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>
): Promise<void> {
  // Always save locally first (immediate)
  await saveProjectLocal(projectId, name, nodes, edges, patches);
  
  saveToBackend(projectId, name, nodes, edges, patches);
}

export async function deleteProjectWithSync(projectId: string): Promise<void> {
  await deleteProjectLocal(projectId);
  
  if (isOnline && !projectId.startsWith('local_')) {
    try {
      await apiDeleteProject(projectId);
    } catch (error) {
      console.error('[syncService] Failed to delete project from backend:', error);
      // Backend deletion failed, but local is already removed
    }
  }
}

/**
 * Import a project from exported data
 * Creates a new project on the server (to get a valid ID) and populates it with imported data
 */
export async function importProjectWithSync(
  importedData: {
    name: string;
    nodes: Record<string, ProjectNode>;
    edges: Record<string, Edge>;
    patches: Record<string, Patches>;
  }
): Promise<ProjectWithSync> {
  const { name, nodes, edges, patches } = importedData;
  
  if (isOnline) {
    try {
      const serverProject = await createProject({ name });
      const projectId = serverProject.id;
      
      await updateProject(projectId, {
        name,
        nodes,
        edges,
        patches: serializePatches(patches),
      });
      
      await saveProjectLocal(projectId, name, nodes, edges, patches);
      
      console.log(`[Sync] Imported project with server ID: ${projectId}`);
      
      return {
        id: projectId,
        name,
        nodes,
        edges,
        patches,
        isLocalOnly: false,
        needsSync: false,
      };
    } catch (error) {
      console.error('[Sync] Failed to import project to server:', error);
      // Fall through to local-only import
    }
  }
  
  // Offline or server failed - create local-only project
  const localId = `local_${Date.now()}`;
  
  await saveProjectLocal(localId, name, nodes, edges, patches);
  
  console.log(`[Sync] Imported project locally with ID: ${localId}`);
  
  return {
    id: localId,
    name,
    nodes,
    edges,
    patches,
    isLocalOnly: true,
    needsSync: true,
  };
}



export async function loadFileWithSync(fileId: string): Promise<ArrayBuffer | null> {
  const localFile = await loadFileLocal(fileId);
  if (localFile) {
    return localFile;
  }
  
  if (isOnline && !fileId.startsWith('local_file_')) {
    try {
      const buffer = await getFileAsArrayBuffer(fileId);
      
      // Cache locally
      // Note: We don't have the original filename here, so we use the ID
      await saveFileLocal(fileId, fileId, 'application/octet-stream', buffer);
      
      return buffer;
    } catch (error) {
      console.error('[syncService] Failed to load file from backend:', error);
      // File not available from backend
    }
  }
  
  return null;
}



export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isOnline) return;
  
  const localProjects = await listProjectsLocal();
  
  for (const summary of localProjects) {
    if (summary.id.startsWith('local_')) {
      const project = await loadProjectLocal(summary.id);
      if (!project) continue;
      
      try {
        const created = await createProject({
          name: project.name,
          nodes: project.nodes,
          edges: project.edges,
          patches: project.patches,
        });
        
        await deleteProjectLocal(summary.id);
        
        await saveProjectLocal(
          created.id,
          created.name,
          created.nodes,
          created.edges,
          deserializePatches(created.patches)
        );
        
      } catch (error) {
        console.error('[syncService] Failed to sync local project to backend:', error);
        // Failed to sync this project, will retry on next online event
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncLocalProjectsToBackend();
  });
}

export interface FileWithSync {
  id: string;
  name: string;
  contentType: string;
}

/**
 * Upload a file — to server when online, otherwise save locally with a local_ prefix
 */
export async function uploadFileWithSync(
  file: File,
  projectId?: string
): Promise<FileWithSync> {
  if (isOnline) {
    try {
      const uploaded = await uploadFile(file, projectId);
      const buffer = await file.arrayBuffer();
      await saveFileLocal(uploaded.id, uploaded.filename, uploaded.contentType, buffer);
      return { id: uploaded.id, name: uploaded.filename, contentType: uploaded.contentType };
    } catch (error) {
      console.error('[syncService] Failed to upload file to backend:', error);
      // Fall through to local-only upload
    }
  }

  const localId = `local_file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const buffer = await file.arrayBuffer();
  await saveFileLocal(localId, file.name, file.type, buffer);
  return { id: localId, name: file.name, contentType: file.type };
}

export async function deleteFileWithSync(fileId: string): Promise<void> {
  await deleteFileLocal(fileId);

  if (isOnline && !fileId.startsWith('local_file_')) {
    try {
      await apiDeleteFile(fileId);
    } catch (error) {
      console.error('[syncService] Failed to delete file from backend:', error);
      // Backend deletion failed, but local is already removed
    }
  }
}

export function getSyncStatus(): typeof syncStatus {
  return { ...syncStatus };
}

export function isNetworkOnline(): boolean {
  return isOnline;
}

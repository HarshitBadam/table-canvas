/**
 * Sync Service - Manages syncing project data between local state and backend
 */

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
  uploadFile as apiUploadFile,
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
import type { ProjectNode, Edge, Patches } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

export interface SyncStatus {
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

// ============================================================================
// Sync State
// ============================================================================

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncedAt: null,
  error: null,
};

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
  });
  window.addEventListener('offline', () => {
    isOnline = false;
  });
}

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

export function isNetworkOnline(): boolean {
  return isOnline;
}

// ============================================================================
// Project Sync Functions
// ============================================================================

/**
 * Fetch all projects - from backend if online, from local storage if offline
 */
export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isOnline) {
    try {
      const projects = await listProjects();
      return projects;
    } catch {
      // Fallback to local storage
    }
  }
  
  // Fallback to local storage
  const localProjects = await listProjectsLocal();
  return localProjects.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: new Date(p.updatedAt),
    createdAt: new Date(p.updatedAt), // Local doesn't track createdAt separately
  }));
}

/**
 * Load a project - from backend if online, from local storage if offline
 */
export async function loadProjectWithSync(projectId: string): Promise<ProjectWithSync | null> {
  if (isOnline) {
    try {
      const project = await getProject(projectId);
      
      // Cache locally
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
    } catch {
      // Fallback to local storage
    }
  }
  
  // Fallback to local storage
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

/**
 * Create a new project
 */
export async function createProjectWithSync(name?: string): Promise<ProjectWithSync> {
  const defaultName = name || 'Untitled Project';
  
  if (isOnline) {
    try {
      const project = await createProject({ name: defaultName });
      
      // Cache locally
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
    } catch {
      // Fallback to local-only project
    }
  }
  
  // Create locally only
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

/**
 * Save project state - debounced auto-save to backend
 */
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
  
  // Then sync to backend (debounced)
  saveToBackend(projectId, name, nodes, edges, patches);
}

/**
 * Delete a project
 */
export async function deleteProjectWithSync(projectId: string): Promise<void> {
  // Delete locally
  await deleteProjectLocal(projectId);
  
  // Delete from backend if online and not a local-only project
  if (isOnline && !projectId.startsWith('local_')) {
    try {
      await apiDeleteProject(projectId);
    } catch {
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
      // Create a new project on the server to get a valid ID
      const serverProject = await createProject({ name });
      const projectId = serverProject.id;
      
      // Now update the project with the imported data
      await updateProject(projectId, {
        name,
        nodes,
        edges,
        patches: serializePatches(patches),
      });
      
      // Save locally with the server-assigned ID
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

// ============================================================================
// File Sync Functions
// ============================================================================

/**
 * Upload a file - to backend if online, to local storage if offline
 */
export async function uploadFileWithSync(
  file: File,
  projectId?: string
): Promise<{ id: string; name: string; type: string }> {
  if (isOnline) {
    try {
      const uploaded = await apiUploadFile(file, projectId);
      
      // Also cache locally
      const buffer = await file.arrayBuffer();
      await saveFileLocal(uploaded.id, file.name, file.type, buffer);
      
      return {
        id: uploaded.id,
        name: uploaded.filename,
        type: uploaded.contentType,
      };
    } catch {
      // Fallback to local-only storage
    }
  }
  
  // Save locally only
  const localId = `local_file_${Date.now()}`;
  const buffer = await file.arrayBuffer();
  await saveFileLocal(localId, file.name, file.type, buffer);
  
  return {
    id: localId,
    name: file.name,
    type: file.type,
  };
}

/**
 * Load a file - from backend if online, from local cache if available
 */
export async function loadFileWithSync(fileId: string): Promise<ArrayBuffer | null> {
  // Try local cache first
  const localFile = await loadFileLocal(fileId);
  if (localFile) {
    return localFile;
  }
  
  // If not in cache and online, fetch from backend
  if (isOnline && !fileId.startsWith('local_file_')) {
    try {
      const buffer = await getFileAsArrayBuffer(fileId);
      
      // Cache locally
      // Note: We don't have the original filename here, so we use the ID
      await saveFileLocal(fileId, fileId, 'application/octet-stream', buffer);
      
      return buffer;
    } catch {
      // File not available from backend
    }
  }
  
  return null;
}

/**
 * Delete a file
 */
export async function deleteFileWithSync(fileId: string): Promise<void> {
  // Delete locally
  await deleteFileLocal(fileId);
  
  // Delete from backend if online and not a local-only file
  if (isOnline && !fileId.startsWith('local_file_')) {
    try {
      await apiDeleteFile(fileId);
    } catch {
      // Backend deletion failed, but local is already removed
    }
  }
}

// ============================================================================
// Sync Local Projects to Backend
// ============================================================================

/**
 * Sync all local-only projects to backend (call when coming online)
 */
export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isOnline) return;
  
  const localProjects = await listProjectsLocal();
  
  for (const summary of localProjects) {
    if (summary.id.startsWith('local_')) {
      const project = await loadProjectLocal(summary.id);
      if (!project) continue;
      
      try {
        // Create on backend
        const created = await createProject({
          name: project.name,
          nodes: project.nodes,
          edges: project.edges,
          patches: project.patches,
        });
        
        // Delete old local version
        await deleteProjectLocal(summary.id);
        
        // Save with new ID
        await saveProjectLocal(
          created.id,
          created.name,
          created.nodes,
          created.edges,
          deserializePatches(created.patches)
        );
        
      } catch {
        // Failed to sync this project, will retry on next online event
      }
    }
  }
}

// Auto-sync when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncLocalProjectsToBackend();
  });
}

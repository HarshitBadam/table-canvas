/**
 * Files API functions
 */

import { api } from './client';


export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: Date;
}


/**
 * List all files for the current user
 */
export async function listFiles(): Promise<UploadedFile[]> {
  const { files } = await api.get<{ files: UploadedFile[] }>('/files');
  return files;
}

/**
 * Upload a file
 */
export async function uploadFile(
  file: File,
  projectId?: string
): Promise<UploadedFile> {
  const additionalData: Record<string, string> = {};
  if (projectId) {
    additionalData.projectId = projectId;
  }

  const { file: uploadedFile } = await api.upload<{ file: UploadedFile }>(
    '/files/upload',
    file,
    additionalData
  );

  return uploadedFile;
}

/**
 * Download a file
 */
export async function downloadFile(fileId: string): Promise<Blob> {
  return api.download(`/files/${fileId}`);
}

/**
 * Get file as ArrayBuffer (for processing)
 */
export async function getFileAsArrayBuffer(fileId: string): Promise<ArrayBuffer> {
  const blob = await downloadFile(fileId);
  return blob.arrayBuffer();
}

/**
 * Get file metadata
 */
export async function getFileMetadata(fileId: string): Promise<UploadedFile> {
  const { file } = await api.get<{ file: UploadedFile }>(
    `/files/${fileId}/metadata`
  );
  return file;
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

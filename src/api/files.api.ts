import { api } from './client';


export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: Date;
}


export async function uploadFile(
  file: File,
  projectId?: string,
  operationId?: string
): Promise<UploadedFile> {
  const additionalData: Record<string, string> = {};
  if (projectId) {
    additionalData.projectId = projectId;
  }

  const { file: uploadedFile } = await api.upload<{ file: UploadedFile }>(
    '/files/upload',
    file,
    additionalData,
    operationId
  );

  return uploadedFile;
}

async function downloadFile(fileId: string): Promise<Blob> {
  return api.download(`/files/${fileId}`);
}

export async function getFileAsArrayBuffer(fileId: string): Promise<ArrayBuffer> {
  const blob = await downloadFile(fileId);
  return blob.arrayBuffer();
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { FileMetadata, UploadedFile } from '../types/index.js';

let bucket: GridFSBucket | null = null;

export function getGridFSBucket(): GridFSBucket {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    bucket = new GridFSBucket(db, {
      bucketName: 'files',
    });
  }
  return bucket;
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
  metadata: FileMetadata
): Promise<UploadedFile> {
  const gridFS = getGridFSBucket();
  
  return new Promise((resolve, reject) => {
    const readableStream = Readable.from(buffer);
    const uploadStream = gridFS.openUploadStream(filename, {
      contentType,
      metadata,
    });

    readableStream.pipe(uploadStream);

    uploadStream.on('error', reject);
    
    uploadStream.on('finish', () => {
      resolve({
        id: uploadStream.id.toString(),
        filename,
        contentType,
        size: buffer.length,
        uploadDate: new Date(),
      });
    });
  });
}

export interface FileDownload {
  stream: NodeJS.ReadableStream;
  filename: string;
  contentType: string;
  size: number;
}

export async function downloadFile(
  fileId: string,
  userId: string
): Promise<FileDownload | null> {
  const gridFS = getGridFSBucket();
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error('Database connection not established');
  }

  const fileDoc = await db.collection('files.files').findOne({
    _id: new ObjectId(fileId),
  });

  if (!fileDoc) {
    return null;
  }

  if (fileDoc.metadata?.userId !== userId) {
    return null;
  }

  const downloadStream = gridFS.openDownloadStream(new ObjectId(fileId));

  return {
    stream: downloadStream,
    filename: fileDoc.filename,
    contentType: fileDoc.contentType || 'application/octet-stream',
    size: fileDoc.length,
  };
}

export async function deleteFile(
  fileId: string,
  userId: string
): Promise<boolean> {
  const gridFS = getGridFSBucket();
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error('Database connection not established');
  }

  const fileDoc = await db.collection('files.files').findOne({
    _id: new ObjectId(fileId),
  });

  if (!fileDoc) {
    return false;
  }

  if (fileDoc.metadata?.userId !== userId) {
    return false;
  }

  await gridFS.delete(new ObjectId(fileId));
  return true;
}


export async function listUserFiles(userId: string): Promise<UploadedFile[]> {
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error('Database connection not established');
  }

  const files = await db.collection('files.files')
    .find({ 'metadata.userId': userId })
    .sort({ uploadDate: -1 })
    .toArray();

  return files.map((f) => ({
    id: f._id.toString(),
    filename: f.filename,
    contentType: f.contentType || 'application/octet-stream',
    size: f.length,
    uploadDate: f.uploadDate,
  }));
}


export async function getFileMetadata(
  fileId: string,
  userId: string
): Promise<UploadedFile | null> {
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error('Database connection not established');
  }

  const fileDoc = await db.collection('files.files').findOne({
    _id: new ObjectId(fileId),
    'metadata.userId': userId,
  });

  if (!fileDoc) {
    return null;
  }

  return {
    id: fileDoc._id.toString(),
    filename: fileDoc.filename,
    contentType: fileDoc.contentType || 'application/octet-stream',
    size: fileDoc.length,
    uploadDate: fileDoc.uploadDate,
  };
}

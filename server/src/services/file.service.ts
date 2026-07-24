import { Readable } from 'stream';
import mongoose, { mongo } from 'mongoose';
import { FileMetadata, UploadedFile } from '../types/index.js';

let bucket: mongo.GridFSBucket | null = null;

function getGridFSBucket(): mongo.GridFSBucket {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    bucket = new mongo.GridFSBucket(db, {
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

export async function findFileByOperationId(
  userId: string,
  operationId: string,
  expected: {
    filename: string
    size: number
    projectId?: string
  },
): Promise<{ file: UploadedFile; matches: boolean } | null> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const file = await db.collection('files.files').findOne({
    'metadata.userId': userId,
    'metadata.clientOperationId': operationId,
  });
  if (!file) return null;
  return {
    file: {
      id: file._id.toString(),
      filename: file.filename,
      contentType: file.contentType || 'application/octet-stream',
      size: file.length,
      uploadDate: file.uploadDate,
    },
    matches: (
      file.filename === expected.filename
      && file.length === expected.size
      && (file.metadata?.projectId ?? undefined) === expected.projectId
    ),
  };
}

export async function initializeFileIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  await db.collection('files.files').createIndex(
    {
      'metadata.userId': 1,
      'metadata.clientOperationId': 1,
    },
    {
      unique: true,
      partialFilterExpression: {
        'metadata.clientOperationId': { $type: 'string' },
      },
    },
  );
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
    _id: new mongo.ObjectId(fileId),
  });

  if (!fileDoc) {
    return null;
  }

  if (fileDoc.metadata?.userId !== userId) {
    return null;
  }

  const downloadStream = gridFS.openDownloadStream(new mongo.ObjectId(fileId));

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
): Promise<number | null> {
  const gridFS = getGridFSBucket();
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error('Database connection not established');
  }

  const fileDoc = await db.collection('files.files').findOne({
    _id: new mongo.ObjectId(fileId),
  });

  if (!fileDoc) {
    return null;
  }

  if (fileDoc.metadata?.userId !== userId) {
    return null;
  }

  await gridFS.delete(new mongo.ObjectId(fileId));
  return fileDoc.length;
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
    _id: new mongo.ObjectId(fileId),
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

export async function getFileLifecycleMetadata(
  fileId: string,
  userId: string,
): Promise<{ projectId?: string } | null> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const file = await db.collection('files.files').findOne(
    {
      _id: new mongo.ObjectId(fileId),
      'metadata.userId': userId,
    },
    { projection: { metadata: 1 } },
  );
  if (!file) return null;
  return {
    projectId: typeof file.metadata?.projectId === 'string'
      ? file.metadata.projectId
      : undefined,
  };
}

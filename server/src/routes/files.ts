import { Router, Response } from 'express';
import multer from 'multer';
import { AuthenticatedRequest, ApiResponse, UploadedFile } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  listUserFiles,
  getFileMetadata,
  findFileByOperationId,
  getFileLifecycleMetadata,
} from '../services/file.service.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AppError,
  ConflictError,
} from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { checkFileSize } from '../config/enforce.js';
import { getLimits, type Tier } from '../config/limits.js';
import { reserveStorage, releaseStorage } from '../services/storageQuota.service.js';
import { createApiRateLimit } from '../middleware/apiRateLimit.js';
import { Types } from 'mongoose';

const router = Router();

// Uploads are the most expensive request the API serves: they buffer in memory
// and write GridFS chunks, so rate-limit upload attempts, including failures.
const uploadLimiter = createApiRateLimit({
  prefix: 'files-upload',
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: 'Too many uploads. Wait a few minutes and try again.',
});

// Downloads stream GridFS chunks, so they are cheaper than uploads but still
// far more costly than a metadata read.
const downloadLimiter = createApiRateLimit({
  prefix: 'files-download',
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: 'Too many file downloads. Wait a few minutes and try again.',
});

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.tablecanvas.snapshot+json',
      'application/octet-stream',
    ];
    
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.tablecanvas'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError(['Only CSV and Excel files are allowed']));
    }
  },
});

function nodesReferenceFile(nodes: unknown, fileId: string): boolean {
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return false;
  return Object.values(nodes as Record<string, unknown>).some((node) => {
    if (!node || typeof node !== 'object') return false;
    const plan = (node as { plan?: unknown }).plan;
    return Boolean(
      plan
      && typeof plan === 'object'
      && (plan as { fileRef?: unknown }).fileRef === fileId
    );
  });
}

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;

    const files = await listUserFiles(userId);

    const response: ApiResponse<{ files: UploadedFile[] }> = {
      success: true,
      data: {
        files,
      },
    };

    res.json(response);
  })
);

router.post(
  '/upload',
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      throw new ValidationError(['No file uploaded']);
    }

    const userDoc = await User.findById(userId);
    const tier: Tier = (userDoc?.tier as Tier) ?? 'google';

    const sizeCheck = checkFileSize(file.size, tier);
    if (!sizeCheck.ok) {
      throw new AppError(sizeCheck.reason, 413);
    }

    const projectId = req.body.projectId as string | undefined;
    if (projectId) {
      if (!Types.ObjectId.isValid(projectId)) {
        throw new ValidationError(['Invalid project ID format']);
      }
      const project = await Project.findByIdAndUser(projectId, userId);
      if (!project) throw new NotFoundError('Project');
    }

    const operationId = req.get('Idempotency-Key')?.trim();
    if (operationId && operationId.length > 200) {
      throw new ValidationError(['Idempotency key cannot exceed 200 characters']);
    }
    if (operationId) {
      const existing = await findFileByOperationId(userId, operationId, {
        filename: file.originalname,
        size: file.size,
        projectId,
      });
      if (existing) {
        if (!existing.matches) {
          throw new ConflictError(
            'Idempotency key was already used with different file data',
          );
        }
        res.json({
          success: true,
          data: { file: existing.file },
        } satisfies ApiResponse<{ file: UploadedFile }>);
        return;
      }
    }

    const reserved = await reserveStorage(
      userId,
      file.size,
      tier === 'google' ? undefined : getLimits(tier).maxServerStorageBytes,
    );
    if (!reserved) {
      throw new AppError('This upload would exceed your storage quota', 413);
    }

    let contentType = file.mimetype;
    const ext = file.originalname.toLowerCase();
    
    if (ext.endsWith('.csv')) {
      contentType = 'text/csv';
    } else if (ext.endsWith('.xlsx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext.endsWith('.xls')) {
      contentType = 'application/vnd.ms-excel';
    } else if (ext.endsWith('.tablecanvas')) {
      contentType = 'application/vnd.tablecanvas.snapshot+json';
    }

    let uploadedFile: UploadedFile;
    try {
      uploadedFile = await uploadFile(
        file.buffer,
        file.originalname,
        contentType,
        {
          originalName: file.originalname,
          userId,
          projectId,
          clientOperationId: operationId,
        },
      );
    } catch (error) {
      await releaseStorage(userId, file.size);
      if (
        operationId
        && error
        && typeof error === 'object'
        && 'code' in error
        && error.code === 11000
      ) {
        const existing = await findFileByOperationId(userId, operationId, {
          filename: file.originalname,
          size: file.size,
          projectId,
        });
        if (existing?.matches) {
          res.json({
            success: true,
            data: { file: existing.file },
          } satisfies ApiResponse<{ file: UploadedFile }>);
          return;
        }
      }
      throw error;
    }

    const response: ApiResponse<{ file: UploadedFile }> = {
      success: true,
      data: {
        file: uploadedFile,
      },
    };

    res.status(201).json(response);
  })
);

router.get(
  '/:id',
  downloadLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;
    if (!Types.ObjectId.isValid(fileId)) {
      throw new ValidationError(['Invalid file ID format']);
    }

    const fileDownload = await downloadFile(fileId, userId);

    if (!fileDownload) {
      throw new NotFoundError('File');
    }

    res.setHeader('Content-Type', fileDownload.contentType);
    res.setHeader('Content-Length', fileDownload.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileDownload.filename)}"`
    );

    fileDownload.stream.pipe(res);
  })
);

router.get(
  '/:id/metadata',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;
    if (!Types.ObjectId.isValid(fileId)) {
      throw new ValidationError(['Invalid file ID format']);
    }

    const metadata = await getFileMetadata(fileId, userId);

    if (!metadata) {
      throw new NotFoundError('File');
    }

    const response: ApiResponse<{ file: UploadedFile }> = {
      success: true,
      data: {
        file: metadata,
      },
    };

    res.json(response);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;
    if (!Types.ObjectId.isValid(fileId)) {
      throw new ValidationError(['Invalid file ID format']);
    }

    const metadata = await getFileLifecycleMetadata(fileId, userId);
    if (!metadata) throw new NotFoundError('File');
    const retainedProjects = await Project.find({
      userId: new Types.ObjectId(userId),
      deletedAt: null,
    }).select('nodes');
    const referenced = retainedProjects.some(project => (
      nodesReferenceFile(project.nodes, fileId)
    ));
    if (referenced) {
      throw new ConflictError('File is still referenced by an active project');
    }

    const deletedBytes = await deleteFile(fileId, userId);

    if (deletedBytes == null) {
      throw new NotFoundError('File');
    }
    await releaseStorage(userId, deletedBytes);

    const response: ApiResponse = {
      success: true,
      message: 'File deleted successfully',
    };

    res.json(response);
  })
);

export default router;

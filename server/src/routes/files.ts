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
} from '../services/file.service.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AppError,
} from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { checkFileSize } from '../config/enforce.js';
import { getLimits, type Tier } from '../config/limits.js';
import { reserveStorage, releaseStorage } from '../services/storageQuota.service.js';
import { Types } from 'mongoose';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB hard ceiling; tier limits are tighter
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

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

    const reserved = await reserveStorage(
      userId,
      file.size,
      getLimits(tier).maxServerStorageBytes,
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
        },
      );
    } catch (error) {
      await releaseStorage(userId, file.size);
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

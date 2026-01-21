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
} from '../middleware/errorHandler.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow CSV and Excel files
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream', // Sometimes CSV files come as this
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

// All file routes require authentication
router.use(requireAuth);

// ============================================================================
// GET /api/files - List user's files
// ============================================================================

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

// ============================================================================
// POST /api/files/upload - Upload a file
// ============================================================================

router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      throw new ValidationError(['No file uploaded']);
    }

    // Determine content type
    let contentType = file.mimetype;
    const ext = file.originalname.toLowerCase();
    
    if (ext.endsWith('.csv')) {
      contentType = 'text/csv';
    } else if (ext.endsWith('.xlsx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext.endsWith('.xls')) {
      contentType = 'application/vnd.ms-excel';
    }

    const uploadedFile = await uploadFile(
      file.buffer,
      file.originalname,
      contentType,
      {
        originalName: file.originalname,
        userId,
        projectId: req.body.projectId,
      }
    );

    const response: ApiResponse<{ file: UploadedFile }> = {
      success: true,
      data: {
        file: uploadedFile,
      },
    };

    res.status(201).json(response);
  })
);

// ============================================================================
// GET /api/files/:id - Download a file
// ============================================================================

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;

    const fileDownload = await downloadFile(fileId, userId);

    if (!fileDownload) {
      throw new NotFoundError('File');
    }

    // Set headers
    res.setHeader('Content-Type', fileDownload.contentType);
    res.setHeader('Content-Length', fileDownload.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileDownload.filename)}"`
    );

    // Pipe the stream to response
    fileDownload.stream.pipe(res);
  })
);

// ============================================================================
// GET /api/files/:id/metadata - Get file metadata
// ============================================================================

router.get(
  '/:id/metadata',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;

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

// ============================================================================
// DELETE /api/files/:id - Delete a file
// ============================================================================

router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const fileId = req.params.id;

    const deleted = await deleteFile(fileId, userId);

    if (!deleted) {
      throw new NotFoundError('File');
    }

    const response: ApiResponse = {
      success: true,
      message: 'File deleted successfully',
    };

    res.json(response);
  })
);

export default router;

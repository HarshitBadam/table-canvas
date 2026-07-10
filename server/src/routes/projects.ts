import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { Project } from '../models/Project.js';
import { AuthenticatedRequest, ApiResponse, IProjectPublic } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AppError,
} from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import { checkProjectCount } from '../config/enforce.js';
import type { Tier } from '../config/limits.js';

const router = Router();

// All project routes require authentication
router.use(requireAuth);

// ============================================================================
// GET /api/projects - List user's projects
// ============================================================================

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;

    const projects = await Project.findByUser(userId);

    const response: ApiResponse<{ projects: Array<{ id: string; name: string; updatedAt: Date; createdAt: Date }> }> = {
      success: true,
      data: {
        projects: projects.map((p) => ({
          id: p._id.toString(),
          name: p.name,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt,
        })),
      },
    };

    res.json(response);
  })
);

// ============================================================================
// POST /api/projects - Create new project
// ============================================================================

router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { name, nodes, edges, patches } = req.body;

    const userDoc = await User.findById(userId);
    const tier: Tier = (userDoc?.tier as Tier) ?? 'google';
    const activeProjects = await Project.countDocuments({
      userId: new Types.ObjectId(userId),
      deletedAt: null,
    });
    const projectCheck = checkProjectCount(activeProjects, tier);
    if (!projectCheck.ok) {
      throw new AppError(projectCheck.reason, 403);
    }

    const project = new Project({
      userId: new Types.ObjectId(userId),
      name: name || 'Untitled Project',
      nodes: nodes || {},
      edges: edges || {},
      patches: patches || {},
    });

    await project.save();

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: project.toPublic(),
      },
    };

    res.status(201).json(response);
  })
);

// ============================================================================
// GET /api/projects/:id - Get project by ID
// ============================================================================

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: project.toPublic(),
      },
    };

    res.json(response);
  })
);

// ============================================================================
// PUT /api/projects/:id - Update project
// ============================================================================

router.put(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;
    const { name, nodes, edges, patches } = req.body;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    // Find project and verify ownership
    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Update fields
    if (name !== undefined) {
      project.name = name;
    }
    if (nodes !== undefined) {
      project.nodes = nodes;
    }
    if (edges !== undefined) {
      project.edges = edges;
    }
    if (patches !== undefined) {
      project.patches = patches;
    }

    await project.save();

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: project.toPublic(),
      },
    };

    res.json(response);
  })
);

// ============================================================================
// PATCH /api/projects/:id - Partial update project
// ============================================================================

router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    // Find project and verify ownership
    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Apply partial updates
    const allowedFields = ['name', 'nodes', 'edges', 'patches'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (project as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }

    await project.save();

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: project.toPublic(),
      },
    };

    res.json(response);
  })
);

// ============================================================================
// DELETE /api/projects/:id - Soft delete project
// ============================================================================

router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    // Find project first to verify ownership
    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Soft delete the project
    await project.softDelete();

    const response: ApiResponse = {
      success: true,
      message: 'Project deleted successfully',
    };

    res.json(response);
  })
);

// ============================================================================
// POST /api/projects/:id/restore - Restore soft-deleted project
// ============================================================================

router.post(
  '/:id/restore',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    // Find project including deleted ones
    const project = await Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      deletedAt: { $ne: null },
    });

    if (!project) {
      throw new NotFoundError('Deleted project');
    }

    // Restore the project
    await project.restore();

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: project.toPublic(),
      },
      message: 'Project restored successfully',
    };

    res.json(response);
  })
);

export default router;

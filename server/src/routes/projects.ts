import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { Project } from '../models/Project.js';
import { AuthenticatedRequest, ApiResponse, IProjectPublic } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import type { Tier } from '../config/limits.js';
import {
  createProjectWithinCapacity,
  restoreProjectWithinCapacity,
} from '../services/projectCapacity.js';

const router = Router();

function expectedRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ValidationError(['expectedRevision must be a non-negative integer']);
  }
  return value as number;
}

function validateProjectPayload(body: Record<string, unknown>): void {
  const objectFields = ['nodes', 'edges', 'patches', 'reports'] as const;
  for (const field of objectFields) {
    const value = body[field];
    if (
      value !== undefined
      && (
        value === null
        || typeof value !== 'object'
        || Array.isArray(value)
      )
    ) {
      throw new ValidationError([`${field} must be an object`]);
    }
  }
  const nodes = body.nodes as Record<string, unknown> | undefined;
  const edges = body.edges as Record<string, unknown> | undefined;
  if (nodes && Object.keys(nodes).length > 5_000) {
    throw new ValidationError(['A project cannot exceed 5,000 nodes']);
  }
  if (edges && Object.keys(edges).length > 20_000) {
    throw new ValidationError(['A project cannot exceed 20,000 edges']);
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 10 * 1024 * 1024) {
    throw new ValidationError(['Project data cannot exceed 10 MB']);
  }
}

async function updateOwnedProject(
  projectId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  validateProjectPayload(body);
  const revision = expectedRevision(body.expectedRevision);
  const allowedFields = ['name', 'nodes', 'edges', 'patches', 'reports'] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const revisionFilter = revision === 0
    ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { revision };
  const project = await Project.findOneAndUpdate(
    {
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      deletedAt: null,
      ...revisionFilter,
    },
    {
      $set: updates,
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true },
  );
  if (project) return project;

  const exists = await Project.exists({
    _id: new Types.ObjectId(projectId),
    userId: new Types.ObjectId(userId),
    deletedAt: null,
  });
  if (!exists) throw new NotFoundError('Project');
  throw new ConflictError(
    'Project changed in another session. Reload before saving to avoid overwriting newer work.',
  );
}

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
    validateProjectPayload(req.body);
    const { name, nodes, edges, patches, reports } = req.body;
    const operationId = req.get('Idempotency-Key')?.trim();
    if (operationId && operationId.length > 200) {
      throw new ValidationError(['Idempotency key cannot exceed 200 characters']);
    }

    const userDoc = await User.findById(userId);
    const tier: Tier = (userDoc?.tier as Tier) ?? 'google';
    const project = await createProjectWithinCapacity({
      userId,
      tier,
      operationId,
      name,
      nodes,
      edges,
      patches,
      reports,
    });

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
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await updateOwnedProject(projectId, userId, req.body);

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

    const project = await updateOwnedProject(projectId, userId, req.body);

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

    const revision = expectedRevision(req.body.expectedRevision);
    const revisionFilter = revision === 0
      ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
      : { revision };
    const project = await Project.findOneAndUpdate(
      {
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(userId),
        deletedAt: null,
        ...revisionFilter,
      },
      {
        $set: { deletedAt: new Date(), quotaSlot: null },
        $inc: { revision: 1 },
      },
      { new: true },
    );

    if (!project) {
      const existing = await Project.findOne({
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(userId),
      });
      if (!existing) throw new NotFoundError('Project');
      if (!existing.isDeleted()) {
        throw new ConflictError(
          'Project changed in another session. Reload before deleting it.',
        );
      }
    }

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

    const userDoc = await User.findById(userId);
    const tier: Tier = (userDoc?.tier as Tier) ?? 'google';
    const revision = expectedRevision(req.body.expectedRevision);
    const restored = await restoreProjectWithinCapacity(
      project,
      userId,
      tier,
      revision,
    );

    const response: ApiResponse<{ project: IProjectPublic }> = {
      success: true,
      data: {
        project: restored.toPublic(),
      },
      message: 'Project restored successfully',
    };

    res.json(response);
  })
);

export default router;

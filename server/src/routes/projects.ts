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
import { deleteFile } from '../services/file.service.js';
import { releaseStorage } from '../services/storageQuota.service.js';

const router = Router();

function expectedRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ValidationError(['expectedRevision must be a non-negative integer']);
  }
  return value as number;
}

async function updateOwnedProject(
  projectId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  const revision = expectedRevision(body.expectedRevision);
  const allowedFields = ['name', 'nodes', 'edges', 'patches'] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const project = await Project.findOneAndUpdate(
    {
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      deletedAt: null,
      revision,
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

function projectFileReferences(nodes: Record<string, unknown>): Set<string> {
  const references = new Set<string>();
  for (const value of Object.values(nodes)) {
    const node = value as { kind?: string; plan?: { fileRef?: unknown } };
    if (
      node.kind === 'source_table'
      && typeof node.plan?.fileRef === 'string'
    ) {
      references.add(node.plan.fileRef);
    }
  }
  return references;
}

async function cleanUnreferencedFiles(
  userId: string,
  deletedNodes: Record<string, unknown>,
): Promise<void> {
  const candidates = projectFileReferences(deletedNodes);
  if (candidates.size === 0) return;
  const retainedProjects = await Project.find({
    userId: new Types.ObjectId(userId),
    deletedAt: null,
  }).select('nodes');
  const retained = new Set<string>();
  for (const project of retainedProjects) {
    for (const fileId of projectFileReferences(project.nodes)) retained.add(fileId);
  }
  for (const fileId of candidates) {
    if (retained.has(fileId) || !Types.ObjectId.isValid(fileId)) continue;
    const deletedBytes = await deleteFile(fileId, userId);
    if (deletedBytes != null) await releaseStorage(userId, deletedBytes);
  }
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
    const { name, nodes, edges, patches } = req.body;
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

    // Include already-deleted projects so retries are idempotent.
    const project = await Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!project.isDeleted()) await project.softDelete();
    await cleanUnreferencedFiles(
      userId,
      project.nodes as unknown as Record<string, unknown>,
    );

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
    const restored = await restoreProjectWithinCapacity(project, userId, tier);

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

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { Project } from '../models/Project.js';
import { AuthenticatedRequest, ApiResponse, IProjectPublic } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);

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

router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { name, nodes, edges, patches } = req.body;

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

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

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

router.put(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;
    const { name, nodes, edges, patches } = req.body;

    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

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

router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

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

router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await Project.findByIdAndUser(projectId, userId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await project.softDelete();

    const response: ApiResponse = {
      success: true,
      message: 'Project deleted successfully',
    };

    res.json(response);
  })
);

router.post(
  '/:id/restore',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const projectId = req.params.id;

    if (!Types.ObjectId.isValid(projectId)) {
      throw new ValidationError(['Invalid project ID format']);
    }

    const project = await Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      deletedAt: { $ne: null },
    });

    if (!project) {
      throw new NotFoundError('Deleted project');
    }

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

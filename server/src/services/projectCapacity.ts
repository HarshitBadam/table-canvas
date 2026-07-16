import { Types } from 'mongoose';
import { LIMITS, type Tier } from '../config/limits.js';
import { checkProjectCount } from '../config/enforce.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  Project,
  type IProjectDocument,
} from '../models/Project.js';
import type {
  Edge,
  ProjectNode,
  SerializedPatches,
} from '../types/index.js';

interface CreateProjectInput {
  userId: string;
  tier: Tier;
  operationId?: string;
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 11000,
  );
}

async function claimSlotsForLegacyProjects(
  userId: Types.ObjectId,
  maxProjects: number,
): Promise<Set<number>> {
  await Project.init();
  for (let attempt = 0; attempt < maxProjects * 3; attempt += 1) {
    const active = await Project.find({ userId, deletedAt: null })
      .select('_id quotaSlot createdAt')
      .sort({ createdAt: 1 });
    const used = new Set(
      active
        .map(project => project.quotaSlot)
        .filter((slot): slot is number => typeof slot === 'number'),
    );
    const legacy = active.find(project => typeof project.quotaSlot !== 'number');
    if (!legacy) return used;
    const slot = Array.from(
      { length: maxProjects },
      (_, index) => index,
    ).find(candidate => !used.has(candidate));
    if (slot === undefined) return used;
    try {
      await Project.updateOne(
        {
          _id: legacy._id,
          deletedAt: null,
          $or: [
            { quotaSlot: { $exists: false } },
            { quotaSlot: null },
          ],
        },
        { $set: { quotaSlot: slot } },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error('Unable to reconcile project capacity slots');
}

export async function createProjectWithinCapacity({
  userId,
  tier,
  operationId,
  name,
  nodes,
  edges,
  patches,
}: CreateProjectInput): Promise<IProjectDocument> {
  const objectUserId = new Types.ObjectId(userId);
  if (operationId) {
    const existing = await Project.findOne({
      userId: objectUserId,
      clientOperationId: operationId,
    });
    if (existing) return existing;
  }

  const maxProjects = LIMITS[tier].maxProjects;
  const used = await claimSlotsForLegacyProjects(objectUserId, maxProjects);
  for (let slot = 0; slot < maxProjects; slot += 1) {
    if (used.has(slot)) continue;
    try {
      return await new Project({
        userId: objectUserId,
        clientOperationId: operationId,
        quotaSlot: slot,
        name: name || 'Untitled Project',
        nodes: nodes || {},
        edges: edges || {},
        patches: patches || {},
      }).save();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (operationId) {
        const existing = await Project.findOne({
          userId: objectUserId,
          clientOperationId: operationId,
        });
        if (existing) return existing;
      }
    }
  }

  const projectCheck = checkProjectCount(maxProjects, tier);
  throw new AppError(
    projectCheck.ok ? 'Project limit reached' : projectCheck.reason,
    403,
  );
}

export async function restoreProjectWithinCapacity(
  project: IProjectDocument,
  userId: string,
  tier: Tier,
): Promise<IProjectDocument> {
  if (!project.isDeleted()) return project;
  const objectUserId = new Types.ObjectId(userId);
  const maxProjects = LIMITS[tier].maxProjects;
  const used = await claimSlotsForLegacyProjects(objectUserId, maxProjects);
  for (let slot = 0; slot < maxProjects; slot += 1) {
    if (used.has(slot)) continue;
    try {
      const restored = await Project.findOneAndUpdate(
        {
          _id: project._id,
          userId: objectUserId,
          deletedAt: { $ne: null },
        },
        {
          $set: {
            deletedAt: null,
            quotaSlot: slot,
          },
        },
        { new: true, runValidators: true },
      );
      if (restored) return restored;
      const active = await Project.findOne({
        _id: project._id,
        userId: objectUserId,
        deletedAt: null,
      });
      if (active) return active;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  const projectCheck = checkProjectCount(maxProjects, tier);
  throw new AppError(
    projectCheck.ok ? 'Project limit reached' : projectCheck.reason,
    403,
  );
}

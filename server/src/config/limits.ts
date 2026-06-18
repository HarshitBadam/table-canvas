/**
 * Tier definitions and usage limits — SERVER DUPLICATE.
 *
 * The source of truth lives at  src/shared/limits.ts  (client workspace root).
 * Keep these values in sync when updating either copy.
 *
 * The server has its own copy because the client and server use incompatible
 * module resolution (bundler vs NodeNext) and different rootDirs, making a
 * single shared import impractical without a monorepo tool.
 */

export type Tier = 'guest' | 'google';

export interface TierLimits {
  maxFileSizeBytes: number;
  maxRowsPerTable: number;
  maxTablesPerProject: number;
  maxProjects: number;
  cloudSync: boolean;
  maxServerStorageBytes?: number;
}

export const LIMITS: Record<Tier, TierLimits> = {
  guest: {
    maxFileSizeBytes: 2 * 1024 * 1024,
    maxRowsPerTable: 25_000,
    maxTablesPerProject: 5,
    maxProjects: 2,
    cloudSync: false,
  },
  google: {
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxRowsPerTable: 500_000,
    maxTablesPerProject: 20,
    maxProjects: 10,
    cloudSync: true,
    maxServerStorageBytes: 40 * 1024 * 1024,
  },
} as const;

export function getLimits(tier: Tier): TierLimits {
  return LIMITS[tier];
}

/**
 * Tier definitions and usage limits for Table Canvas.
 *
 * SOURCE OF TRUTH — if you update numbers here, mirror them in
 * server/src/config/limits.ts (the server duplicate).
 *
 * No enforcement happens in this file; it only exports plain constants.
 */

export type Tier = 'guest' | 'google';

export interface TierLimits {
  maxFileSizeBytes: number;
  maxRowsPerTable: number;
  maxTablesPerProject: number;
  maxProjects: number;
  cloudSync: boolean;
  /** Only meaningful for tiers that have cloud sync. */
  maxServerStorageBytes?: number;
}

const LIMITS: Record<Tier, TierLimits> = {
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

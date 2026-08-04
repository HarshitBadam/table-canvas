/**
 * SOURCE OF TRUTH for client tier limits — mirror number changes in
 * server/src/config/limits.ts. Constants only; enforcement lives elsewhere.
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

/**
 * Hard ceiling on join/union output rows for every tier (including 'google').
 * DuckDB-Wasm is in-memory only (engine.worker.ts, `path: ':memory:'`, no
 * spill), so a low-cardinality join can explode into hundreds of millions of
 * rows and OOM the tab. Not a plan gate.
 */
export const MAX_SAFE_TRANSFORM_OUTPUT_ROWS = 5_000_000;

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

/**
 * Hard technical ceiling on join/union output rows, independent of pricing
 * tier (including 'google', which is otherwise exempt from row limits).
 *
 * DuckDB-Wasm runs entirely in the browser's in-memory heap (see
 * engine/worker/engine.worker.ts, opened with `path: ':memory:'` and no
 * temp_directory) with no ability to spill to disk. A join on a
 * low-cardinality or duplicate-heavy key can multiply two modest tables into
 * hundreds of millions or billions of output rows and crash the tab with an
 * Out of Memory error. This constant exists purely to protect the browser
 * process from that crash, not to gate features by plan.
 */
export const MAX_SAFE_TRANSFORM_OUTPUT_ROWS = 5_000_000;

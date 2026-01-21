/**
 * Profiling Service
 * Computes table metadata and statistics in phases
 */

import { useCallback } from 'react'
import { create } from 'zustand'
import { getEngine } from '@/engine'
import type { ProfileResult } from '@/engine/types'
import type { CellValue, ColumnProfile, SemanticHint } from '@/lib/types'
import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'

// Semantic pattern detectors
const PATTERNS = {
  currency: /^\$?[\d,]+\.?\d*$/,
  percentage: /^\d+\.?\d*%$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/[^\s]+$/,
  phone: /^[\d\-\+\(\)\s]+$/,
  zipcode: /^\d{5}(-\d{4})?$/,
  date: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
}

/**
 * Detect semantic hints for a column based on its values
 */
export function detectSemanticHints(
  columnName: string,
  values: CellValue[],
  type: string
): SemanticHint[] {
  const hints: SemanticHint[] = []
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  
  if (nonNullValues.length === 0) return hints

  const sampleSize = Math.min(100, nonNullValues.length)
  const sample = nonNullValues.slice(0, sampleSize).map(v => String(v))

  // Name-based hints
  const lowerName = columnName.toLowerCase()
  
  // ID detection - be more specific to avoid false positives like "valid", "ividual"
  // Match: ends with _id, starts with id_, is exactly "id", or contains "key"/"code" as word
  const isIdColumn = 
    lowerName === 'id' ||
    lowerName.endsWith('_id') ||
    lowerName.endsWith('id') && lowerName.length <= 12 ||  // e.g. "product_id", "customerid"
    lowerName.startsWith('id_') ||
    /\b(key|code)\b/.test(lowerName)  // word boundary for key/code
  
  if (isIdColumn) {
    hints.push('id')
  }
  
  if (lowerName.includes('email')) {
    hints.push('email')
  }
  
  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('website')) {
    hints.push('url')
  }
  
  if (lowerName.includes('phone') || lowerName.includes('tel') || lowerName.includes('mobile')) {
    hints.push('phone')
  }
  
  if (lowerName.includes('zip') || lowerName.includes('postal')) {
    hints.push('zipcode')
  }
  
  if (lowerName.includes('country')) {
    hints.push('country')
  }
  
  if (lowerName.includes('category') || lowerName.includes('type') || lowerName.includes('status')) {
    hints.push('category')
  }

  // Pattern-based hints for string columns
  if (type === 'string') {
    // Check currency
    const currencyMatches = sample.filter(v => PATTERNS.currency.test(v)).length
    if (currencyMatches / sampleSize > 0.8) {
      hints.push('currency')
    }

    // Check percentage
    const percentMatches = sample.filter(v => PATTERNS.percentage.test(v)).length
    if (percentMatches / sampleSize > 0.8) {
      hints.push('percentage')
    }

    // Check email
    const emailMatches = sample.filter(v => PATTERNS.email.test(v)).length
    if (emailMatches / sampleSize > 0.8 && !hints.includes('email')) {
      hints.push('email')
    }

    // Check URL
    const urlMatches = sample.filter(v => PATTERNS.url.test(v)).length
    if (urlMatches / sampleSize > 0.8 && !hints.includes('url')) {
      hints.push('url')
    }
  }

  // Cardinality-based hints
  const uniqueValues = new Set(sample)
  const uniqueRatio = uniqueValues.size / sampleSize

  // Low cardinality suggests category
  if (uniqueRatio < 0.1 && uniqueValues.size <= 20 && !hints.includes('category')) {
    hints.push('category')
  }

  // Note: We no longer auto-flag high cardinality strings as IDs
  // That caused false positives for names, descriptions, etc.
  // ID detection is now based on column name only

  return hints
}

/**
 * Compute key candidates based on uniqueness
 */
export function computeKeyCandidates(
  columns: ColumnProfile[]
): string[] {
  return columns
    .filter(col => {
      // High uniqueness and low missing = good key candidate
      const uniquenessRatio = col.distinctCount / (col.distinctCount + col.missingCount || 1)
      return uniquenessRatio > 0.95 && col.missingPercent < 1
    })
    .map(col => col.columnId)
}

/**
 * Run Phase 1 profiling (fast, immediate)
 */
export async function runPhase1Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  return engine.getProfile(tableId, 1)
}

/**
 * Run Phase 2 profiling (background, more detailed)
 */
export async function runPhase2Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  return engine.getProfile(tableId, 2)
}

/**
 * Profiling Store - caches profiling results
 */

interface ProfilingState {
  profiles: Record<string, ProfileResult>
  loading: Record<string, boolean>
  
  setProfile: (tableId: string, profile: ProfileResult) => void
  setLoading: (tableId: string, loading: boolean) => void
  getProfile: (tableId: string) => ProfileResult | undefined
  clearProfile: (tableId: string) => void
  clearAndStartLoading: (tableId: string) => void
}

export const useProfilingStore = create<ProfilingState>((set, get) => ({
  profiles: {},
  loading: {},
  
  setProfile: (tableId, profile) => {
    set((state) => ({
      profiles: { ...state.profiles, [tableId]: profile },
      loading: { ...state.loading, [tableId]: false },
    }))
  },
  
  setLoading: (tableId, loading) => {
    set((state) => ({
      loading: { ...state.loading, [tableId]: loading },
    }))
  },
  
  getProfile: (tableId) => get().profiles[tableId],
  
  clearProfile: (tableId) => {
    set((state) => {
      const { [tableId]: _, ...profiles } = state.profiles
      const { [tableId]: __, ...loading } = state.loading
      return { profiles, loading }
    })
  },
  
  // Clear profile but set loading=true to prevent race conditions
  clearAndStartLoading: (tableId) => {
    set((state) => {
      const { [tableId]: _, ...profiles } = state.profiles
      return { 
        profiles, 
        loading: { ...state.loading, [tableId]: true }
      }
    })
  },
}))

/**
 * Ensure table data is loaded into the engine before profiling
 * This is needed when tables are restored from persistence but not yet in DuckDB
 * @param force - If true, always reload data into DuckDB even if it exists
 */
async function ensureTableInEngine(tableId: string, force: boolean = false): Promise<boolean> {
  try {
    const tableData = useDataStore.getState().tableData[tableId]
    const node = useProjectStore.getState().getTableNode(tableId)
    
    if (!tableData?.rows || !node?.schema) {
      console.warn('[Profiler] No data available for table:', tableId, {
        hasTableData: !!tableData,
        hasRows: !!tableData?.rows,
        rowCount: tableData?.rows?.length,
        hasNode: !!node,
        hasSchema: !!node?.schema,
      })
      return false
    }
    
    console.log('[Profiler] Loading table into engine:', tableId, {
      rowCount: tableData.rows.length,
      columnCount: node.schema.columns.length,
      force,
    })
    
    // Load the table into DuckDB engine (always reload if force=true)
    // IMPORTANT: Get patches so profiler sees the same data as the UI
    const patches = useProjectStore.getState().patches[tableId]
    const engine = getEngine()
    await engine.loadTable(tableId, node.schema, tableData.rows, patches)
    console.log('[Profiler] Successfully loaded table into engine:', tableId)
    return true
  } catch (error) {
    console.error('[Profiler] Failed to load table into engine:', error)
    return false
  }
}

/**
 * Hook to get profiling results with automatic loading
 */
export function useProfile(tableId: string | null) {
  const profile = useProfilingStore((state) => tableId ? state.profiles[tableId] : undefined)
  const loading = useProfilingStore((state) => tableId ? state.loading[tableId] : false)
  const setProfile = useProfilingStore((state) => state.setProfile)
  const setLoading = useProfilingStore((state) => state.setLoading)

  // Use useCallback with minimal deps - check state inside the function
  const loadProfile = useCallback(async () => {
    if (!tableId) return
    
    // Check current state from store (not captured state)
    const store = useProfilingStore.getState()
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (currentLoading || currentProfile) {
      console.log('[Profiler] Skipping - already loading or has profile:', { tableId, currentLoading, hasProfile: !!currentProfile })
      return
    }
    
    console.log('[Profiler] Starting profile load for:', tableId)
    setLoading(tableId, true)
    
    try {
      // Ensure table is in DuckDB first
      const loaded = await ensureTableInEngine(tableId)
      if (!loaded) {
        console.warn('[Profiler] Could not load table into engine, skipping profiling')
        setLoading(tableId, false)
        return
      }
      
      // Phase 1 first
      console.log('[Profiler] Running Phase 1 profiling...')
      const phase1 = await runPhase1Profiling(tableId)
      const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
      console.log('[Profiler] Phase 1 complete:', {
        rowCount: phase1.rowCount,
        columnCount: phase1.columns.length,
      })
      setProfile(tableId, enrichedPhase1)
      
      // Then Phase 2 in background
      runPhase2Profiling(tableId).then(phase2 => {
        console.log('[Profiler] Phase 2 complete')
        const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
        setProfile(tableId, enrichedPhase2)
      }).catch(console.error)
    } catch (error) {
      console.error('[Profiler] Profiling error:', error)
      setLoading(tableId, false)
    }
  }, [tableId, setLoading, setProfile])

  return { profile, loading, loadProfile }
}

/**
 * Enrich profile results with semantic hints computed from actual data
 */
function enrichProfileWithSemanticHints(profile: ProfileResult, tableId: string): ProfileResult {
  const tableData = useDataStore.getState().tableData[tableId]
  const node = useProjectStore.getState().getTableNode(tableId)
  
  if (!tableData?.rows || !node?.schema) {
    return profile
  }
  
  const enrichedColumns = profile.columns.map(colProfile => {
    const schemaCol = node.schema?.columns.find(c => c.id === colProfile.columnId)
    if (!schemaCol) return colProfile
    
    // Extract column values from rows
    const values: CellValue[] = tableData.rows.map(row => row[colProfile.columnId])
    
    // Detect semantic hints
    const hints = detectSemanticHints(schemaCol.name, values, schemaCol.type)
    
    return {
      ...colProfile,
      semanticHints: hints.length > 0 ? hints : undefined,
    }
  })
  
  return {
    ...profile,
    columns: enrichedColumns,
  }
}

/**
 * Standalone function to load profile for a table (can be called from non-hook contexts)
 * @param force - If true, clears existing cache and forces a fresh reload
 */
export async function loadProfileForTable(tableId: string, force: boolean = false): Promise<void> {
  const store = useProfilingStore.getState()
  
  // If forcing, clear profile and set loading in one atomic operation
  // This prevents race conditions where UI sees profile=undefined, loading=false
  if (force) {
    store.clearAndStartLoading(tableId)
  } else {
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (currentLoading || currentProfile) {
      return
    }
    
    store.setLoading(tableId, true)
  }
  
  try {
    // Force reload table into DuckDB with current dataStore data
    const loaded = await ensureTableInEngine(tableId, force)
    if (!loaded) {
      store.setLoading(tableId, false)
      return
    }
    
    const phase1 = await runPhase1Profiling(tableId)
    const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
    store.setProfile(tableId, enrichedPhase1)
    
    // Phase 2 in background
    runPhase2Profiling(tableId).then(phase2 => {
      const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
      store.setProfile(tableId, enrichedPhase2)
    }).catch(console.error)
  } catch (error) {
    console.error('[Profiler] Error loading profile:', error)
    store.setLoading(tableId, false)
  }
}


import { create } from 'zustand'
import { getEngine } from '@/engine'
import type { ProfileResult } from '@/engine/types'
import type { CellValue } from '@/types'
import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import { detectSemanticHints } from './semanticHints'

/**
 * The engine profiles the DuckDB table, whose columns are created from each column's
 * display `name` (see EngineAdapter.loadTable), so ColumnProfile.columnId comes back as a
 * NAME. The rest of the app keys profiles by the stable column `id` — e.g. every rule does
 * `profile.columns.find(p => p.columnId === col.id)` — so without this remap the lookup
 * misses and all profile-driven rules (cleaning, outliers, quality metrics) silently fail.
 */
function remapProfileColumnIds(profile: ProfileResult, tableId: string): ProfileResult {
  const node = useProjectStore.getState().getTableNode(tableId)
  const columns = node?.schema?.columns
  if (!columns || columns.length === 0) return profile

  const nameToId = new Map<string, string>()
  for (const col of columns) {
    nameToId.set(col.name, col.id)
    if (col.duckDbName) nameToId.set(col.duckDbName, col.id)
  }

  return {
    ...profile,
    columns: profile.columns.map((col) => ({
      ...col,
      columnId: nameToId.get(col.columnId) ?? col.columnId,
    })),
  }
}

export async function runPhase1Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  const profile = await engine.getProfile(tableId, 1)
  return remapProfileColumnIds(profile, tableId)
}

export async function runPhase2Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  const profile = await engine.getProfile(tableId, 2)
  return remapProfileColumnIds(profile, tableId)
}

export interface ProfilingState {
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
      const profiles = { ...state.profiles }
      const loading = { ...state.loading }
      delete profiles[tableId]
      delete loading[tableId]
      return { profiles, loading }
    })
  },
  
  clearAndStartLoading: (tableId) => {
    set((state) => {
      const profiles = { ...state.profiles }
      delete profiles[tableId]
      return { 
        profiles, 
        loading: { ...state.loading, [tableId]: true }
      }
    })
  },
}))

// For derived tables this triggers materialization before profiling.
export async function ensureTableInEngine(tableId: string, _force: boolean = false): Promise<boolean> {
  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    if (!node) return false
    
    if (node.kind === 'derived_table') {
      const { ensureTableMaterialized } = await import('@/engine/materializationService')
      const result = await ensureTableMaterialized(tableId)
      return result.status !== 'error'
    }
    
    const tableData = useDataStore.getState().tableData[tableId]
    if (!tableData?.rows || !node?.schema) {
      const { ensureTableMaterialized } = await import('@/engine/materializationService')
      const result = await ensureTableMaterialized(tableId)
      return result.status !== 'error'
    }
    
    const patches = useProjectStore.getState().patches[tableId]
    const engine = getEngine()
    await engine.loadTable(tableId, node.schema, tableData.rows, patches)
    return true
  } catch (err) {
    console.error('[Profiler] ensureTableInEngine failed:', tableId, err)
    return false
  }
}

export function enrichProfileWithSemanticHints(profile: ProfileResult, tableId: string): ProfileResult {
  const tableData = useDataStore.getState().tableData[tableId]
  const node = useProjectStore.getState().getTableNode(tableId)
  
  if (!tableData?.rows || !node?.schema) {
    return profile
  }
  
  const enrichedColumns = profile.columns.map(colProfile => {
    const schemaCol = node.schema?.columns.find(c => c.id === colProfile.columnId)
    if (!schemaCol) return colProfile
    
    const values: CellValue[] = tableData.rows.map(row => row[colProfile.columnId])
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

export async function loadProfileForTable(tableId: string, force: boolean = false): Promise<void> {
  const store = useProfilingStore.getState()
  
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
    const loaded = await ensureTableInEngine(tableId, force)
    if (!loaded) {
      store.setLoading(tableId, false)
      return
    }
    
    const phase1 = await runPhase1Profiling(tableId)
    const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
    store.setProfile(tableId, enrichedPhase1)
    
    runPhase2Profiling(tableId).then(phase2 => {
      const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
      store.setProfile(tableId, enrichedPhase2)
    }).catch((error) => {
      console.error('[profilingStore] Phase 2 profiling failed:', error)
    })
  } catch (error) {
    console.error('[profilingStore] Failed to load profile for table:', tableId, error)
    store.setLoading(tableId, false)
  }
}

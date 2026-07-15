import { create } from 'zustand'
import { getEngine } from '@/engine'
import type { ProfileResult } from '@/engine/types'
import type { CellValue, TableNode } from '@/types'
import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { detectSemanticHints } from './semanticHints'

export function getTableProfileVersionForNode(node: TableNode | undefined): string {
  if (!node) return 'missing'
  const schemaVersion = node.schema?.columns.map((column) => [
    column.id,
    column.name,
    column.type,
    column.nullable,
    column.sourceName,
    column.duckDbName,
  ])
  return JSON.stringify([
    node.updatedAt,
    node.cacheInfo?.dataRevision ?? 0,
    schemaVersion,
  ])
}

export function getTableProfileVersion(tableId: string): string {
  return getTableProfileVersionForNode(useProjectStore.getState().getTableNode(tableId))
}

function mapProfileColumnNamesToSchemaIds(profile: ProfileResult, tableId: string): ProfileResult {
  const node = useProjectStore.getState().getTableNode(tableId)
  const columns = node?.schema?.columns
  if (!columns || columns.length === 0) return profile

  const schemaIdByProfileName = new Map<string, string>()
  for (const col of columns) {
    schemaIdByProfileName.set(col.name, col.id)
    if (col.duckDbName) schemaIdByProfileName.set(col.duckDbName, col.id)
  }

  return {
    ...profile,
    columns: profile.columns.map((col) => ({
      ...col,
      columnId: schemaIdByProfileName.get(col.columnId) ?? col.columnId,
    })),
  }
}

export async function runPhase1Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  const profile = await engine.getProfile(tableId, 1)
  return mapProfileColumnNamesToSchemaIds(profile, tableId)
}

export async function runPhase2Profiling(tableId: string): Promise<ProfileResult> {
  const engine = getEngine()
  const profile = await engine.getProfile(tableId, 2)
  return mapProfileColumnNamesToSchemaIds(profile, tableId)
}

export interface ProfilingState {
  profiles: Record<string, ProfileResult>
  profileVersions: Record<string, string>
  loading: Record<string, boolean>
  loadingVersions: Record<string, string>
  
  setProfile: (tableId: string, profile: ProfileResult, version?: string) => void
  setLoading: (tableId: string, loading: boolean, version?: string) => void
  getProfile: (tableId: string) => ProfileResult | undefined
  clearProfile: (tableId: string) => void
  clearAndStartLoading: (tableId: string, version?: string) => void
}

export const useProfilingStore = create<ProfilingState>((set, get) => ({
  profiles: {},
  profileVersions: {},
  loading: {},
  loadingVersions: {},
  
  setProfile: (tableId, profile, version = getTableProfileVersion(tableId)) => {
    if (version !== getTableProfileVersion(tableId)) return
    set((state) => ({
      profiles: { ...state.profiles, [tableId]: profile },
      profileVersions: { ...state.profileVersions, [tableId]: version },
      loading: { ...state.loading, [tableId]: false },
      loadingVersions: Object.fromEntries(
        Object.entries(state.loadingVersions).filter(([id]) => id !== tableId),
      ),
    }))
  },
  
  setLoading: (tableId, loading, version = getTableProfileVersion(tableId)) => {
    set((state) => {
      if (!loading && state.loadingVersions[tableId] !== version) return state
      const loadingVersions = { ...state.loadingVersions }
      if (loading) loadingVersions[tableId] = version
      else delete loadingVersions[tableId]
      return {
        loading: { ...state.loading, [tableId]: loading },
        loadingVersions,
      }
    })
  },
  
  getProfile: (tableId) =>
    get().profileVersions[tableId] === getTableProfileVersion(tableId)
      ? get().profiles[tableId]
      : undefined,
  
  clearProfile: (tableId) => {
    set((state) => {
      const profiles = { ...state.profiles }
      const profileVersions = { ...state.profileVersions }
      const loading = { ...state.loading }
      const loadingVersions = { ...state.loadingVersions }
      delete profiles[tableId]
      delete profileVersions[tableId]
      delete loading[tableId]
      delete loadingVersions[tableId]
      return { profiles, profileVersions, loading, loadingVersions }
    })
  },
  
  clearAndStartLoading: (tableId, version = getTableProfileVersion(tableId)) => {
    set((state) => {
      const profiles = { ...state.profiles }
      const profileVersions = { ...state.profileVersions }
      delete profiles[tableId]
      delete profileVersions[tableId]
      return { 
        profiles, 
        profileVersions,
        loading: { ...state.loading, [tableId]: true },
        loadingVersions: { ...state.loadingVersions, [tableId]: version },
      }
    })
  },
}))

useProjectStore.subscribe((state, previousState) => {
  if (state.nodes === previousState.nodes) return

  useProfilingStore.setState((profilingState) => {
    const profiles = { ...profilingState.profiles }
    const profileVersions = { ...profilingState.profileVersions }
    const loading = { ...profilingState.loading }
    const loadingVersions = { ...profilingState.loadingVersions }
    let changed = false
    const tableIds = new Set([
      ...Object.keys(profiles),
      ...Object.keys(loadingVersions),
    ])

    for (const tableId of tableIds) {
      const node = state.nodes[tableId]
      const tableNode = node?.kind === 'source_table' || node?.kind === 'derived_table'
        ? node
        : undefined
      const currentVersion = getTableProfileVersionForNode(tableNode)
      if (profileVersions[tableId] && profileVersions[tableId] !== currentVersion) {
        delete profiles[tableId]
        delete profileVersions[tableId]
        changed = true
      }
      if (loadingVersions[tableId] && loadingVersions[tableId] !== currentVersion) {
        delete loading[tableId]
        delete loadingVersions[tableId]
        changed = true
      }
    }

    return changed
      ? { profiles, profileVersions, loading, loadingVersions }
      : profilingState
  })
})

export async function ensureTableInEngine(tableId: string, _force: boolean = false): Promise<boolean> {
  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    if (!node) return false
    const result = await ensureTableMaterialized(tableId)
    return result.status !== 'error'
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
  const requestedVersion = getTableProfileVersion(tableId)
  
  if (force) {
    store.clearAndStartLoading(tableId, requestedVersion)
  } else {
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (
      (currentLoading && store.loadingVersions[tableId] === requestedVersion)
      || (currentProfile && store.profileVersions[tableId] === requestedVersion)
    ) {
      return
    }
    
    store.clearAndStartLoading(tableId, requestedVersion)
  }
  
  try {
    const loaded = await ensureTableInEngine(tableId, force)
    if (!loaded) {
      store.setLoading(tableId, false, requestedVersion)
      return
    }
    
    const phase1 = await runPhase1Profiling(tableId)
    const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
    store.setProfile(tableId, enrichedPhase1, requestedVersion)
    
    runPhase2Profiling(tableId).then(phase2 => {
      const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
      store.setProfile(tableId, enrichedPhase2, requestedVersion)
    }).catch((error) => {
      console.error('[profilingStore] Phase 2 profiling failed:', error)
    })
  } catch (error) {
    console.error('[profilingStore] Failed to load profile for table:', tableId, error)
    store.setLoading(tableId, false, requestedVersion)
  }
}

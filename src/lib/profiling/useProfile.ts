import { useCallback } from 'react'
import {
  useProfilingStore,
  ensureTableInEngine,
  runPhase1Profiling,
  runPhase2Profiling,
  enrichProfileWithSemanticHints,
  getTableProfileVersionForNode,
} from './profilingStore'
import { useProjectStore } from '@/state/projectStore'

export function useProfile(tableId: string | null) {
  const tableNode = useProjectStore((state) =>
    tableId ? state.getTableNode(tableId) : undefined,
  )
  const tableVersion = getTableProfileVersionForNode(tableNode)
  const profile = useProfilingStore((state) =>
    tableId && state.profileVersions[tableId] === tableVersion
      ? state.profiles[tableId]
      : undefined,
  )
  const loading = useProfilingStore((state) =>
    tableId
      ? state.loading[tableId] && state.loadingVersions[tableId] === tableVersion
      : false,
  )
  const setProfile = useProfilingStore((state) => state.setProfile)
  const setLoading = useProfilingStore((state) => state.setLoading)
  const clearProfile = useProfilingStore((state) => state.clearProfile)

  const loadProfile = useCallback(async () => {
    if (!tableId) return
    
    const store = useProfilingStore.getState()
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (currentLoading && store.loadingVersions[tableId] === tableVersion) {
      return
    }

    if (currentProfile && store.profileVersions[tableId] === tableVersion) return
    if (currentProfile) clearProfile(tableId)
    
    setLoading(tableId, true, tableVersion)
    const requestedVersion = tableVersion
    const requestIsCurrent = () =>
      getTableProfileVersionForNode(
        useProjectStore.getState().getTableNode(tableId),
      ) === requestedVersion
    
    try {
      const loaded = await ensureTableInEngine(tableId)
      if (!loaded) {
        setLoading(tableId, false, requestedVersion)
        return
      }
      
      const phase1 = await runPhase1Profiling(tableId)
      if (!requestIsCurrent()) {
        setLoading(tableId, false, requestedVersion)
        return
      }
      const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
      setProfile(tableId, enrichedPhase1, requestedVersion)
      
      runPhase2Profiling(tableId).then(phase2 => {
        if (!requestIsCurrent()) return
        const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
        setProfile(tableId, enrichedPhase2, requestedVersion)
      }).catch((error) => {
        console.error('[useProfile] Phase 2 profiling failed:', error)
      })
    } catch (error) {
      console.error('[useProfile] Failed to load profile for table:', tableId, error)
      setLoading(tableId, false, requestedVersion)
    }
  }, [tableId, tableVersion, setLoading, setProfile, clearProfile])

  return { profile, loading, loadProfile }
}

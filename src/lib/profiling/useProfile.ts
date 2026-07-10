import { useCallback } from 'react'
import {
  useProfilingStore,
  ensureTableInEngine,
  runPhase1Profiling,
  runPhase2Profiling,
  enrichProfileWithSemanticHints,
} from './profilingStore'
import { useProjectStore } from '@/state/projectStore'

function isProfileCurrent(computedAt: string | undefined, updatedAt: string | undefined): boolean {
  if (!computedAt || !updatedAt) return true
  return Date.parse(computedAt) >= Date.parse(updatedAt)
}

export function useProfile(tableId: string | null) {
  const profile = useProfilingStore((state) => tableId ? state.profiles[tableId] : undefined)
  const loading = useProfilingStore((state) => tableId ? state.loading[tableId] : false)
  const tableUpdatedAt = useProjectStore((state) => tableId ? state.nodes[tableId]?.updatedAt : undefined)
  const setProfile = useProfilingStore((state) => state.setProfile)
  const setLoading = useProfilingStore((state) => state.setLoading)
  const clearProfile = useProfilingStore((state) => state.clearProfile)

  const loadProfile = useCallback(async () => {
    if (!tableId) return
    
    const store = useProfilingStore.getState()
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (currentLoading) {
      return
    }

    if (currentProfile && isProfileCurrent(currentProfile.computedAt, tableUpdatedAt)) return
    if (currentProfile) clearProfile(tableId)
    
    setLoading(tableId, true)
    const requestedVersion = tableUpdatedAt
    const requestIsCurrent = () =>
      useProjectStore.getState().nodes[tableId]?.updatedAt === requestedVersion
    
    try {
      const loaded = await ensureTableInEngine(tableId)
      if (!loaded) {
        setLoading(tableId, false)
        return
      }
      
      const phase1 = await runPhase1Profiling(tableId)
      if (!requestIsCurrent()) {
        setLoading(tableId, false)
        return
      }
      const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
      setProfile(tableId, enrichedPhase1)
      
      runPhase2Profiling(tableId).then(phase2 => {
        if (!requestIsCurrent()) return
        const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
        setProfile(tableId, enrichedPhase2)
      }).catch((error) => {
        console.error('[useProfile] Phase 2 profiling failed:', error)
      })
    } catch (error) {
      console.error('[useProfile] Failed to load profile for table:', tableId, error)
      setLoading(tableId, false)
    }
  }, [tableId, tableUpdatedAt, setLoading, setProfile, clearProfile])

  return { profile, loading, loadProfile }
}

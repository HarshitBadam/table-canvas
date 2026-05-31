import { useCallback } from 'react'
import {
  useProfilingStore,
  ensureTableInEngine,
  runPhase1Profiling,
  runPhase2Profiling,
  enrichProfileWithSemanticHints,
} from './profilingStore'

export function useProfile(tableId: string | null) {
  const profile = useProfilingStore((state) => tableId ? state.profiles[tableId] : undefined)
  const loading = useProfilingStore((state) => tableId ? state.loading[tableId] : false)
  const setProfile = useProfilingStore((state) => state.setProfile)
  const setLoading = useProfilingStore((state) => state.setLoading)

  const loadProfile = useCallback(async () => {
    if (!tableId) return
    
    const store = useProfilingStore.getState()
    const currentLoading = store.loading[tableId]
    const currentProfile = store.profiles[tableId]
    
    if (currentLoading || currentProfile) {
      return
    }
    
    setLoading(tableId, true)
    
    try {
      const loaded = await ensureTableInEngine(tableId)
      if (!loaded) {
        setLoading(tableId, false)
        return
      }
      
      const phase1 = await runPhase1Profiling(tableId)
      const enrichedPhase1 = enrichProfileWithSemanticHints(phase1, tableId)
      setProfile(tableId, enrichedPhase1)
      
      runPhase2Profiling(tableId).then(phase2 => {
        const enrichedPhase2 = enrichProfileWithSemanticHints(phase2, tableId)
        setProfile(tableId, enrichedPhase2)
      }).catch((error) => {
        console.error('[useProfile] Phase 2 profiling failed:', error)
      })
    } catch (error) {
      console.error('[useProfile] Failed to load profile for table:', tableId, error)
      setLoading(tableId, false)
    }
  }, [tableId, setLoading, setProfile])

  return { profile, loading, loadProfile }
}

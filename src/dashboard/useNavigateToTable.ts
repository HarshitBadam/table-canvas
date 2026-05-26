import { useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'

export function useNavigateToTable() {
  const selectNode = useProjectStore((state) => state.selectNode)

  // The actual navigation to grid view is handled by the parent App component
  // through the onOpenTable callback
  return useCallback((tableId: string) => {
    selectNode(tableId)
  }, [selectNode])
}

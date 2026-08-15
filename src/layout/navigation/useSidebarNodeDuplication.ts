import { useState } from 'react'
import type { ProjectNode } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { continuePendingSourceDuplicate } from '@/state/project/continuePendingSourceDuplicate'
import { duplicateDerivedTable } from '@/state/project/duplicateDerivedTable'
import { useAppAuth } from '@/state/AppContext'
import { isTableWaiting, useNodeCacheInfo } from '@/state/tableRuntimeStore'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import { beginTableOperation } from '@/state/runtime/tableOperationCoordinator'

export interface SidebarNodeDuplicationState {
  duplicating: boolean
  upgradeViolation: LimitExceeded | null
  upgradeOpen: boolean
  setUpgradeOpen: (open: boolean) => void
  duplicateError: string | null
  clearDuplicateError: () => void
  duplicate: () => Promise<void>
}

/**
 * Orchestrates duplicating a sidebar node: table-count limit checks, the
 * source/derived/generic duplication paths, and the upgrade/error dialog
 * state those paths can raise.
 */
export function useSidebarNodeDuplication(node: ProjectNode): SidebarNodeDuplicationState {
  const duplicateNode = useProjectStore(state => state.duplicateNode)
  const nodes = useProjectStore(state => state.nodes)
  const { user } = useAppAuth()
  const cacheInfo = useNodeCacheInfo(node.id)
  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  const duplicate = async () => {
    if (node.kind === 'source_table' || node.kind === 'derived_table') {
      const currentTableCount = Object.values(nodes).filter(
        candidate => candidate.kind === 'source_table' || candidate.kind === 'derived_table',
      ).length
      const capacity = checkTableCount(currentTableCount, user?.tier ?? 'guest')
      if (!capacity.ok) {
        setUpgradeViolation(capacity)
        setUpgradeOpen(true)
        return
      }
    }

    if (node.kind === 'derived_table') {
      if (duplicating) return
      setDuplicating(true)
      const result = await duplicateDerivedTable(
        node.id,
        user?.tier ?? 'guest',
        { selectDuplicate: false },
      )
      setDuplicating(false)
      if (!result.ok) {
        if (result.code === 'LIMIT_EXCEEDED') {
          setUpgradeViolation(result.violation)
          setUpgradeOpen(true)
        } else {
          setDuplicateError(result.error)
        }
        return
      }
      return
    }

    const duplicateId = duplicateNode(node.id, { selectDuplicate: false })
    if (
      duplicateId
      && node.kind === 'source_table'
      && isTableWaiting(cacheInfo)
    ) {
      const generation = beginTableOperation(duplicateId, 'waiting')
      void continuePendingSourceDuplicate(node.id, duplicateId, generation)
    }
  }

  return {
    duplicating,
    upgradeViolation,
    upgradeOpen,
    setUpgradeOpen,
    duplicateError,
    clearDuplicateError: () => setDuplicateError(null),
    duplicate,
  }
}

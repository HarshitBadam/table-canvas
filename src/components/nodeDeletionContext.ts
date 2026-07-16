import { createContext, useContext } from 'react'

export interface NodeDeletionContextValue {
  requestNodeDeletion: (nodeId: string, returnFocus?: HTMLElement | null) => void
  deletionPending: boolean
}

export const NodeDeletionContext = createContext<NodeDeletionContextValue | null>(null)

export function useNodeDeletion() {
  const context = useContext(NodeDeletionContext)
  if (!context) throw new Error('useNodeDeletion must be used within NodeDeletionProvider')
  return context
}

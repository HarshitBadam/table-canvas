import { useProjectStore } from './projectStore'

export function beginHistoryTransaction(description: string): string {
  const id = useProjectStore.getState().beginHistoryTransaction(description)
  if (!id) throw new Error('Another table operation is still in progress.')
  return id
}

export function commitHistoryTransaction(id: string): void {
  if (!useProjectStore.getState().commitHistoryTransaction(id)) {
    throw new Error('The project changed before the operation could be committed.')
  }
}

export function rollbackHistoryTransaction(id: string | null): void {
  if (id) useProjectStore.getState().rollbackHistoryTransaction(id)
}

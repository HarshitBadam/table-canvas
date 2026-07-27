import { useCallback, useSyncExternalStore } from 'react'
import {
  getLeaseState,
  requestWriteLease,
  subscribeLease,
  type LeaseState,
} from './documentLease'

export interface WorkspaceLease extends LeaseState {
  /** Mutating controls read this; false means another tab is editing. */
  canEdit: boolean
  requestEditing: () => void
}

/** Tooltip for every control disabled because another tab holds editing. */
export const EDITING_ELSEWHERE_TOOLTIP = 'Editing is active in another tab.'

export function useWorkspaceLease(): WorkspaceLease {
  const state = useSyncExternalStore(subscribeLease, getLeaseState, getLeaseState)
  const requestEditing = useCallback(() => requestWriteLease(), [])
  return {
    ...state,
    // Only a known mirror disables the UI. `acquiring` lasts a few milliseconds while
    // the lock settles, and flickering every control on every load costs more than it
    // buys: persistence is gated separately on `holdsWriteLease`, so nothing written in
    // that window can reach the document if this tab turns out to be a mirror.
    canEdit: state.role !== 'mirror',
    requestEditing,
  }
}

import { useSyncExternalStore } from 'react'
import {
  getLeaseState,
  subscribeLease,
  type LeaseState,
} from './documentLease'

export interface WorkspaceLease extends LeaseState {
  /** Mutating controls read this; false means another tab is editing. */
  canEdit: boolean
}

/** Tooltip for every control disabled because another tab holds editing. */
export const EDITING_ELSEWHERE_TOOLTIP = 'Editing is active in another tab.'

export function useWorkspaceLease(): WorkspaceLease {
  const state = useSyncExternalStore(subscribeLease, getLeaseState, getLeaseState)
  return {
    ...state,
    // Only a known mirror is statically read-only. `acquiring` is brief while the
    // lock settles; persistence still fails closed via `holdsWriteLease`.
    canEdit: state.role !== 'mirror',
  }
}

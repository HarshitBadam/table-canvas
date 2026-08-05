import { useSyncExternalStore } from 'react'
import {
  getLeaseState,
  hasDocumentLease,
  subscribeLease,
  type LeaseState,
} from './documentLease'

export interface WorkspaceLease extends LeaseState {
  canEdit: boolean
}

export const EDITING_ELSEWHERE_TOOLTIP = 'Editing is active in another tab.'

export function useWorkspaceLease(): WorkspaceLease {
  const state = useSyncExternalStore(subscribeLease, getLeaseState, getLeaseState)
  return {
    ...state,
    // The initial lock probe is brief, but controls must fail closed until the
    // browser has granted ownership. With no document open, project creation and
    // other non-document controls remain available.
    canEdit: !hasDocumentLease() || state.role === 'owner',
  }
}

export interface LockSnapshotCounts {
  openHeld: number
  writeHeld: boolean
  writePending: boolean
}

/**
 * Pure decision for `canDeleteDocument`'s `locks.query()` branch, split out so
 * the eligibility rules for active vs. inactive documents can be read and
 * tested on their own.
 */
export function canDeleteFromSnapshot(
  counts: LockSnapshotCounts,
  isActiveDocument: boolean,
  thisTabHoldsPresence: boolean,
  holdsOwnWriteLease: boolean,
): boolean {
  const { openHeld, writeHeld, writePending } = counts
  if (isActiveDocument) {
    // This tab contributes one shared presence holder. Any additional holder
    // (or a queued write waiter) means another tab still has the project open.
    if (openHeld > 1) return false
    if (openHeld === 1) {
      if (!thisTabHoldsPresence) return false
      return !writePending
    }
    // Presence not registered yet — only allow if we already own the write
    // lease and nobody else is waiting for it.
    if (!holdsOwnWriteLease || writePending) return false
    return true
  }
  return !(openHeld > 0 || writeHeld || writePending)
}

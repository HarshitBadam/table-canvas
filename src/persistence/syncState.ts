export interface SyncStatus {
  isSyncing: boolean
  lastSyncedAt: Date | null
  error: string | null
}

let status: SyncStatus = { isSyncing: false, lastSyncedAt: null, error: null }
let online = typeof navigator === 'undefined' || navigator.onLine

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true })
  window.addEventListener('offline', () => { online = false })
}

export function isNetworkOnline(): boolean {
  return online
}

export function getSyncStatus(): SyncStatus {
  return { ...status }
}

export function updateSyncStatus(next: Partial<SyncStatus>): void {
  status = { ...status, ...next }
}

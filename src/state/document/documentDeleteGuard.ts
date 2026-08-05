import { documentLeaseName, documentOpenLockName } from './documentIdentity'
import { hasOpenDocumentPeer } from './documentPresence'

export interface DeleteGuardResult<T> {
  acquired: boolean
  value?: T
}

export async function withInactiveDocumentDeleteGuard<T>(
  key: string,
  action: () => Promise<T>,
): Promise<DeleteGuardResult<T>> {
  if (await hasOpenDocumentPeer(key)) return { acquired: false }
  const locks = navigator.locks
  if (!locks) {
    return { acquired: true, value: await action() }
  }

  return locks.request(
    documentOpenLockName(key),
    { mode: 'exclusive', ifAvailable: true },
    async openLock => {
      if (!openLock) return { acquired: false }
      return locks.request(
        documentLeaseName(key),
        { mode: 'exclusive', ifAvailable: true },
        async writeLock => {
          if (!writeLock) return { acquired: false }
          return { acquired: true, value: await action() }
        },
      )
    },
  )
}

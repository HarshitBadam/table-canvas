const QUOTA_WARNING_THRESHOLD = 0.8

export interface StorageQuota {
  usage: number
  quota: number
  percentUsed: number
  isNearLimit: boolean
}

export async function checkStorageQuota(): Promise<StorageQuota | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null

  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const percentUsed = quota > 0 ? usage / quota : 0
    return {
      usage,
      quota,
      percentUsed,
      isNearLimit: percentUsed >= QUOTA_WARNING_THRESHOLD,
    }
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

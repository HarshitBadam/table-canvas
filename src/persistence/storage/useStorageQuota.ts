import { useState, useEffect } from 'react'
import { checkStorageQuota, type StorageQuota } from './quotaMonitor'

export function useStorageQuota(intervalMs = 60_000): StorageQuota | null {
  const [quota, setQuota] = useState<StorageQuota | null>(null)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      const result = await checkStorageQuota()
      if (mounted) setQuota(result)
    }

    check()
    const id = setInterval(check, intervalMs)

    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [intervalMs])

  return quota
}

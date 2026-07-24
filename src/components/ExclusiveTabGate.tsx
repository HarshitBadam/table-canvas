import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { prepareForTabRelease } from '@/state/tabOwnership'

const LOCK_NAME = 'table-canvas:active-workspace'
const CHANNEL_NAME = 'table-canvas:tab-coordination'
const TAKEOVER_KEY = 'table-canvas:tab-takeover'

type GateStatus = 'checking' | 'active' | 'blocked'

function tabId(): string {
  try {
    const existing = sessionStorage.getItem('table-canvas:tab-id')
    if (existing) return existing
  } catch {
    // A generated in-memory ID is sufficient when storage is restricted.
  }
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    sessionStorage.setItem('table-canvas:tab-id', id)
  } catch {
    // Continue with the in-memory ID.
  }
  return id
}

export function ExclusiveTabGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>('checking')
  const [attempt, setAttempt] = useState(0)
  const releaseRef = useRef<(() => void) | null>(null)
  const idRef = useRef<string>('')

  useEffect(() => {
    idRef.current = tabId()
    let cancelled = false
    let channel: BroadcastChannel | null = null

    const release = async () => {
      try {
        await prepareForTabRelease()
      } catch (error) {
        console.error('[TabOwnership] Could not flush before takeover:', error)
      }
      releaseRef.current?.()
      releaseRef.current = null
      if (!cancelled) setStatus('blocked')
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TAKEOVER_KEY || !event.newValue) return
      try {
        const requestingTab = JSON.parse(event.newValue) as { tabId?: string }
        if (requestingTab.tabId !== idRef.current) void release()
      } catch {
        // Ignore malformed coordination messages.
      }
    }

    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
        if (event.data.type === 'takeover' && event.data.tabId !== idRef.current) {
          void release()
        }
      }
    }
    window.addEventListener('storage', onStorage)

    const locks = navigator.locks
    if (!locks) {
      // Browsers supported by the app expose Web Locks. Fail closed when they do not:
      // concurrent writers are less safe than requiring another supported tab.
      setStatus('blocked')
      return () => {
        cancelled = true
        channel?.close()
        window.removeEventListener('storage', onStorage)
      }
    }

    void locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (cancelled) return
      if (!lock) {
        setStatus('blocked')
        return
      }
      setStatus('active')
      await new Promise<void>(resolve => {
        releaseRef.current = resolve
      })
    })

    return () => {
      cancelled = true
      releaseRef.current?.()
      releaseRef.current = null
      channel?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [attempt])

  const takeOver = useCallback(() => {
    setStatus('checking')
    const message = { type: 'takeover', tabId: idRef.current, at: Date.now() }
    try {
      localStorage.setItem(TAKEOVER_KEY, JSON.stringify(message))
    } catch {
      // BroadcastChannel remains the primary takeover signal.
    }
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channel.postMessage(message)
      channel.close()
    }
    window.setTimeout(() => setAttempt(value => value + 1), 150)
  }, [])

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-text-secondary">
        Opening Table Canvas…
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
          <h1 className="text-lg font-semibold text-text-primary">Table Canvas is open in another tab</h1>
          <p className="mt-2 text-sm text-text-secondary">
            One active tab prevents conflicting edits and silent data loss.
          </p>
          <button type="button" onClick={takeOver} className="btn btn-primary mt-5">
            Use this tab instead
          </button>
        </section>
      </main>
    )
  }

  return children
}

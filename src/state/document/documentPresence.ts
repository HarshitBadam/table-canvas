import { documentTabId } from './documentIdentity'

const PRESENCE_CHANNEL_NAME = 'table-canvas:document-presence'
const PRESENCE_PROBE_TIMEOUT_MS = 100

interface PresenceProbe {
  type: 'probe'
  key: string
  requestId: string
  senderId: string
}

interface PresenceResponse {
  type: 'open'
  key: string
  requestId: string
  senderId: string
}

function isPresenceProbe(value: unknown): value is PresenceProbe {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<PresenceProbe>
  return message.type === 'probe'
    && typeof message.key === 'string'
    && typeof message.requestId === 'string'
    && typeof message.senderId === 'string'
}

function isPresenceResponse(value: unknown): value is PresenceResponse {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<PresenceResponse>
  return message.type === 'open'
    && typeof message.key === 'string'
    && typeof message.requestId === 'string'
    && typeof message.senderId === 'string'
}

export function openDocumentPresenceChannel(
  key: string,
  tabId: string,
): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  const channel = new BroadcastChannel(PRESENCE_CHANNEL_NAME)
  channel.onmessage = event => {
    if (!isPresenceProbe(event.data)) return
    if (event.data.key !== key || event.data.senderId === tabId) return
    channel.postMessage({
      type: 'open',
      key,
      requestId: event.data.requestId,
      senderId: tabId,
    } satisfies PresenceResponse)
  }
  return channel
}

export async function hasOpenDocumentPeer(key: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return false
  const channel = new BroadcastChannel(PRESENCE_CHANNEL_NAME)
  const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const senderId = documentTabId()

  return new Promise(resolve => {
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      channel.close()
      resolve(open)
    }
    const timer = window.setTimeout(() => finish(false), PRESENCE_PROBE_TIMEOUT_MS)
    channel.onmessage = event => {
      if (!isPresenceResponse(event.data)) return
      if (
        event.data.key === key
        && event.data.requestId === requestId
        && event.data.senderId !== senderId
      ) {
        finish(true)
      }
    }
    channel.postMessage({ type: 'probe', key, requestId, senderId } satisfies PresenceProbe)
  })
}

let online = typeof navigator === 'undefined' || navigator.onLine

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true })
  window.addEventListener('offline', () => { online = false })
}

export function isNetworkOnline(): boolean {
  return online
}

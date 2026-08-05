const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4000

/** Backoff state for retrying a failed mirror-lock promotion. */
export interface MirrorRetry {
  attempt: number
  timer: ReturnType<typeof setTimeout> | null
}

export function createMirrorRetry(): MirrorRetry {
  return { attempt: 0, timer: null }
}

export function clearMirrorRetry(retry: MirrorRetry): void {
  if (retry.timer === null) return
  clearTimeout(retry.timer)
  retry.timer = null
}

export function resetMirrorRetry(retry: MirrorRetry): void {
  retry.attempt = 0
}

/**
 * Schedules `onRetry` after an exponential backoff instead of retrying
 * immediately, so a persistently failing mirror adoption cannot spin the write
 * lock request in a tight loop and starve other tabs of scheduling turns.
 */
export function scheduleMirrorRetry(retry: MirrorRetry, onRetry: () => void): void {
  const delay = Math.min(BASE_DELAY_MS * 2 ** retry.attempt, MAX_DELAY_MS)
  retry.attempt += 1
  retry.timer = setTimeout(() => {
    retry.timer = null
    onRetry()
  }, delay)
}

/**
 * Performance Utilities
 * 
 * Utility functions and hooks for optimizing React performance.
 */

import { useCallback, useRef, useMemo, DependencyList } from 'react'

// ============================================================================
// Debounce Hook
// ============================================================================

/**
 * Returns a debounced version of the callback that delays invoking
 * until after wait milliseconds have elapsed since the last call.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  wait: number,
  deps: DependencyList = []
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, wait)
    }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callback, wait, ...deps]
  )
}

// ============================================================================
// Throttle Hook
// ============================================================================

/**
 * Returns a throttled version of the callback that only invokes
 * at most once per wait milliseconds.
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  wait: number,
  deps: DependencyList = []
): T {
  const lastCallRef = useRef(0)
  const lastResultRef = useRef<ReturnType<T>>()

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastCallRef.current >= wait) {
        lastCallRef.current = now
        lastResultRef.current = callback(...args) as ReturnType<T>
      }
      return lastResultRef.current
    }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callback, wait, ...deps]
  )
}

// ============================================================================
// Previous Value Hook
// ============================================================================

/**
 * Returns the previous value of the input.
 * Useful for comparing current and previous values in effects.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  const previous = ref.current
  ref.current = value
  return previous
}

// ============================================================================
// Stable Callback Hook
// ============================================================================

/**
 * Returns a stable callback reference that always calls the latest version.
 * Useful when you need a stable reference but the callback deps change.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    []
  )
}

// ============================================================================
// Shallow Compare
// ============================================================================

/**
 * Shallow comparison of two objects.
 * Returns true if all keys and values are strictly equal.
 */
export function shallowEqual<T extends Record<string, unknown>>(
  objA: T,
  objB: T
): boolean {
  if (objA === objB) return true
  if (!objA || !objB) return false

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (objA[key] !== objB[key]) return false
  }

  return true
}

// ============================================================================
// Memoize with Custom Compare
// ============================================================================

/**
 * Creates a memoized selector with custom equality check.
 * Useful for creating selectors that compare specific fields.
 */
export function createMemoizedSelector<TState, TResult>(
  selector: (state: TState) => TResult,
  equalityFn: (a: TResult, b: TResult) => boolean = Object.is
): (state: TState) => TResult {
  let lastResult: TResult | undefined
  let lastState: TState | undefined

  return (state: TState): TResult => {
    if (state === lastState && lastResult !== undefined) {
      return lastResult
    }

    const result = selector(state)
    
    if (lastResult !== undefined && equalityFn(result, lastResult)) {
      return lastResult
    }

    lastState = state
    lastResult = result
    return result
  }
}

// ============================================================================
// Lazy Initialization
// ============================================================================

/**
 * Hook for lazily initializing expensive values.
 * The initializer is only called once.
 */
export function useLazyInit<T>(initializer: () => T): T {
  const ref = useRef<{ value: T } | null>(null)

  if (ref.current === null) {
    ref.current = { value: initializer() }
  }

  return ref.current.value
}

// ============================================================================
// Render Count (Development Only)
// ============================================================================

/**
 * Hook for tracking render counts in development.
 * Useful for identifying unnecessary re-renders.
 */
export function useRenderCount(componentName: string): void {
  const countRef = useRef(0)
  countRef.current++

  if (process.env.NODE_ENV === 'development') {
    console.log(`[${componentName}] render #${countRef.current}`)
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

function fakeDatabase() {
  return { close: vi.fn() }
}

beforeEach(() => {
  vi.resetModules()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('idb')
})

describe('dbCore connection lifecycle', () => {
  it('clears the resolved open promise when a version change blocks', async () => {
    const databases = [fakeDatabase(), fakeDatabase()]
    const callbacks: Array<{ blocking?: () => void }> = []
    const openDB = vi.fn((_name, _version, options) => {
      callbacks.push(options as { blocking?: () => void })
      return Promise.resolve(databases[callbacks.length - 1])
    })
    vi.doMock('idb', async () => ({
      ...(await vi.importActual<typeof import('idb')>('idb')),
      openDB,
    }))

    const { getDB } = await import('@/persistence/storage/local-db/dbCore')
    expect(await getDB()).toBe(databases[0])

    callbacks[0].blocking?.()

    expect(databases[0].close).toHaveBeenCalledOnce()
    expect(await getDB()).toBe(databases[1])
    expect(openDB).toHaveBeenCalledTimes(2)
  })

  it('closes a late open and lets a new generation retry after timeout', async () => {
    vi.useFakeTimers()
    const first = deferred<ReturnType<typeof fakeDatabase>>()
    const second = deferred<ReturnType<typeof fakeDatabase>>()
    const openDB = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.doMock('idb', async () => ({
      ...(await vi.importActual<typeof import('idb')>('idb')),
      openDB,
    }))

    const { getDB } = await import('@/persistence/storage/local-db/dbCore')
    const timedOutOpen = getDB()
    const timeoutRejection = expect(timedOutOpen).rejects.toThrow('did not open in time')
    await vi.advanceTimersByTimeAsync(8_000)
    await timeoutRejection

    const retriedOpen = getDB()
    const lateDatabase = fakeDatabase()
    first.resolve(lateDatabase)
    await vi.waitFor(() => expect(lateDatabase.close).toHaveBeenCalledOnce())

    const currentDatabase = fakeDatabase()
    second.resolve(currentDatabase)
    await expect(retriedOpen).resolves.toBe(currentDatabase)
    expect(openDB).toHaveBeenCalledTimes(2)
  })
})

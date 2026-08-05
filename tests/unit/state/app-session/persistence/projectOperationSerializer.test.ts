import { describe, expect, it } from 'vitest'
import {
  bumpActiveProjectGeneration,
  getActiveProjectGeneration,
  serializeProjectOperation,
} from '@/state/app-session/persistence/projectOperationSerializer'

describe('projectOperationSerializer', () => {
  it('serializes overlapping operations in submission order', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = serializeProjectOperation(() => new Promise<void>((resolve) => {
      releaseFirst = () => {
        order.push('first')
        resolve()
      }
    }))
    const second = serializeProjectOperation(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual([])
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first', 'second'])
  })

  it('continues serializing later operations after an earlier one throws', async () => {
    const failing = serializeProjectOperation(async () => {
      throw new Error('boom')
    })
    const following = serializeProjectOperation(async () => 'done')

    await expect(failing).rejects.toThrow('boom')
    await expect(following).resolves.toBe('done')
  })

  it('bumps a monotonically increasing generation counter', () => {
    const before = getActiveProjectGeneration()
    const next = bumpActiveProjectGeneration()

    expect(next).toBe(before + 1)
    expect(getActiveProjectGeneration()).toBe(next)

    const after = bumpActiveProjectGeneration()
    expect(after).toBe(next + 1)
  })
})

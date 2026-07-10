import { describe, expect, it } from 'vitest'
import { getDB } from './dbTestSupport'

describe('Database edge cases', () => {
  it('handles empty project', async () => {
    const db = await getDB()
    await db.saveProject('empty', 'Empty Project', {}, {}, {})
    const loaded = await db.loadProject('empty')
    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(0)
    expect(Object.keys(loaded?.edges || {})).toHaveLength(0)
  })

  it('handles large file data', async () => {
    const db = await getDB()
    const largeData = new Uint8Array(1024 * 1024)
    for (let index = 0; index < largeData.length; index++) {
      largeData[index] = index % 256
    }
    await db.saveFile('large-file', 'large.bin', 'application/octet-stream', largeData.buffer)
    const loaded = await db.loadFile('large-file')
    expect(loaded?.byteLength).toBe(1024 * 1024)
  })

  it('handles special characters in project name', async () => {
    const db = await getDB()
    const specialName = 'Test "Project" <with> & special \'chars\''
    await db.saveProject('special', specialName, {}, {}, {})
    expect((await db.loadProject('special'))?.name).toBe(specialName)
  })

  it('handles concurrent saves to same project', async () => {
    const db = await getDB()
    await Promise.all([
      db.saveProject('concurrent', 'Version 1', {}, {}, {}),
      db.saveProject('concurrent', 'Version 2', {}, {}, {}),
      db.saveProject('concurrent', 'Version 3', {}, {}, {}),
    ])
    expect(await db.loadProject('concurrent')).not.toBeNull()
  })

  it('preserves the original creation timestamp across saves', async () => {
    const db = await getDB()
    await db.saveProject('timestamps', 'First', {}, {}, {})
    const createdAt = (await db.loadProject('timestamps'))?.createdAt

    await db.saveProject('timestamps', 'Second', {}, {}, {})

    expect((await db.loadProject('timestamps'))?.createdAt).toBe(createdAt)
  })

  it('preserves server timestamps when caching a remote project', async () => {
    const db = await getDB()
    const createdAt = '2025-01-01T00:00:00.000Z'
    const updatedAt = '2025-02-01T00:00:00.000Z'

    await db.saveProject(
      'remote-timestamps',
      'Remote',
      {},
      {},
      {},
      { createdAt, updatedAt },
    )

    const loaded = await db.loadProject('remote-timestamps')
    expect(loaded?.createdAt).toBe(createdAt)
    expect(loaded?.updatedAt).toBe(updatedAt)
  })

})

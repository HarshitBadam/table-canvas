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

})

import { describe, it, expect } from 'vitest'
import {
  checkFileSize,
  checkRowCount,
  checkTableCount,
  checkProjectTableLimits,
  checkProjectCount,
  checkStorageQuota,
} from './enforce'

describe('enforce helpers', () => {
  describe('checkFileSize', () => {
    it('allows files within guest limit (2 MB)', () => {
      expect(checkFileSize(1_000_000, 'guest')).toEqual({ ok: true })
    })

    it('allows files exactly at guest limit', () => {
      expect(checkFileSize(2 * 1024 * 1024, 'guest')).toEqual({ ok: true })
    })

    it('rejects files over the guest limit', () => {
      const result = checkFileSize(2 * 1024 * 1024 + 1, 'guest')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.tier).toBe('guest')
        expect(result.limit).toBe(2 * 1024 * 1024)
      }
    })

    it('allows larger files for google tier', () => {
      expect(checkFileSize(10 * 1024 * 1024, 'google')).toEqual({ ok: true })
    })

    it('rejects files over the google limit', () => {
      const result = checkFileSize(25 * 1024 * 1024 + 1, 'google')
      expect(result.ok).toBe(false)
    })
  })

  describe('checkRowCount', () => {
    it('allows rows within guest limit', () => {
      expect(checkRowCount(25_000, 'guest')).toEqual({ ok: true })
    })

    it('rejects rows over the guest limit', () => {
      const result = checkRowCount(25_001, 'guest')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.limit).toBe(25_000)
      }
    })

    it('allows higher row count for google tier', () => {
      expect(checkRowCount(100_000, 'google')).toEqual({ ok: true })
    })

    it('rejects rows over the google limit', () => {
      const result = checkRowCount(500_001, 'google')
      expect(result.ok).toBe(false)
    })
  })

  describe('checkTableCount', () => {
    it('allows when below guest limit', () => {
      expect(checkTableCount(4, 'guest')).toEqual({ ok: true })
    })

    it('rejects when at or above guest limit', () => {
      const result = checkTableCount(5, 'guest')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.limit).toBe(5)
      }
    })

    it('allows up to google limit', () => {
      expect(checkTableCount(19, 'google')).toEqual({ ok: true })
    })

    it('rejects at google limit', () => {
      const result = checkTableCount(20, 'google')
      expect(result.ok).toBe(false)
    })
  })

  describe('checkProjectTableLimits', () => {
    const sourceTable = (id: string, rowCount: number) => ({
      id,
      kind: 'source_table' as const,
      name: `Table ${id}`,
      ui: { position: { x: 0, y: 0 } },
      schema: { columns: [], rowCount },
      plan: {
        fileRef: '',
        fileName: '',
        fileType: 'csv' as const,
        inferredSchemaVersion: 1,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    it('allows projects at the guest table and row boundaries', () => {
      const nodes = Object.fromEntries(
        Array.from({ length: 5 }, (_, index) => [
          `table-${index}`,
          sourceTable(`table-${index}`, 25_000),
        ]),
      )
      expect(checkProjectTableLimits(nodes, 'guest')).toEqual({ ok: true })
    })

    it('rejects imported projects with too many tables', () => {
      const nodes = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          `table-${index}`,
          sourceTable(`table-${index}`, 1),
        ]),
      )
      expect(checkProjectTableLimits(nodes, 'guest')).toMatchObject({
        ok: false,
        limit: 5,
      })
    })

    it('rejects imported projects with an oversized table', () => {
      const nodes = { table: sourceTable('table', 25_001) }
      expect(checkProjectTableLimits(nodes, 'guest')).toMatchObject({
        ok: false,
        limit: 25_000,
      })
    })

    it('includes inserted rows when validating an imported project', () => {
      const nodes = { table: sourceTable('table', 25_000) }
      const patches = {
        table: {
          cellPatches: {},
          deletedRows: new Set<string>(),
          insertedRows: [{ rowId: 'new-row', values: {}, insertedAt: 25_000 }],
          highlightedCells: new Set<string>(),
        },
      }
      expect(checkProjectTableLimits(nodes, 'guest', patches)).toMatchObject({
        ok: false,
        limit: 25_000,
      })
    })
  })

  describe('checkProjectCount', () => {
    it('allows when below guest limit', () => {
      expect(checkProjectCount(1, 'guest')).toEqual({ ok: true })
    })

    it('rejects when at guest limit', () => {
      const result = checkProjectCount(2, 'guest')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.limit).toBe(2)
        expect(result.tier).toBe('guest')
      }
    })

    it('allows up to google limit', () => {
      expect(checkProjectCount(9, 'google')).toEqual({ ok: true })
    })

    it('rejects at google limit', () => {
      const result = checkProjectCount(10, 'google')
      expect(result.ok).toBe(false)
    })
  })

  describe('checkStorageQuota', () => {
    it('allows when within quota for google tier', () => {
      const result = checkStorageQuota(10 * 1024 * 1024, 5 * 1024 * 1024, 'google')
      expect(result).toEqual({ ok: true })
    })

    it('rejects when exceeding quota for google tier', () => {
      const used = 38 * 1024 * 1024
      const newFile = 5 * 1024 * 1024
      const result = checkStorageQuota(used, newFile, 'google')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.limit).toBe(40 * 1024 * 1024)
      }
    })

    it('always allows for guest tier (no cloud storage)', () => {
      const result = checkStorageQuota(999_999_999, 999_999_999, 'guest')
      expect(result).toEqual({ ok: true })
    })

    it('allows exactly at the boundary', () => {
      const max = 40 * 1024 * 1024
      const result = checkStorageQuota(max - 100, 100, 'google')
      expect(result).toEqual({ ok: true })
    })

    it('rejects one byte over', () => {
      const max = 40 * 1024 * 1024
      const result = checkStorageQuota(max - 100, 101, 'google')
      expect(result.ok).toBe(false)
    })
  })
})

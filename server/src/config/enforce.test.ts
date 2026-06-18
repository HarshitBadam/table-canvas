import { describe, it, expect } from 'vitest';
import {
  checkFileSize,
  checkProjectCount,
  checkStorageQuota,
} from './enforce.js';

describe('server enforce helpers', () => {
  describe('checkFileSize', () => {
    it('allows files at the google limit', () => {
      expect(checkFileSize(25 * 1024 * 1024, 'google')).toEqual({ ok: true });
    });

    it('rejects files over the google limit', () => {
      const result = checkFileSize(25 * 1024 * 1024 + 1, 'google');
      expect(result.ok).toBe(false);
    });
  });

  describe('checkProjectCount', () => {
    it('allows below the limit', () => {
      expect(checkProjectCount(9, 'google')).toEqual({ ok: true });
    });

    it('rejects at the limit', () => {
      const result = checkProjectCount(10, 'google');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.limit).toBe(10);
      }
    });
  });

  describe('checkStorageQuota', () => {
    it('allows within quota', () => {
      expect(checkStorageQuota(0, 1024, 'google')).toEqual({ ok: true });
    });

    it('rejects exceeding quota', () => {
      const result = checkStorageQuota(
        39 * 1024 * 1024,
        2 * 1024 * 1024,
        'google',
      );
      expect(result.ok).toBe(false);
    });
  });
});

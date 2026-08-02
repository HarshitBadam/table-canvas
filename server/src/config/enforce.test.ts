import { describe, it, expect } from 'vitest';
import {
  checkFileSize,
  checkProjectCount,
  checkStorageQuota,
} from './enforce.js';

describe('server enforce helpers', () => {
  describe('checkFileSize', () => {
    it('allows arbitrarily large files for google tier', () => {
      expect(checkFileSize(Number.MAX_SAFE_INTEGER, 'google')).toEqual({ ok: true });
    });
  });

  describe('checkProjectCount', () => {
    it('allows arbitrarily many projects for google tier', () => {
      expect(checkProjectCount(Number.MAX_SAFE_INTEGER, 'google')).toEqual({ ok: true });
    });
  });

  describe('checkStorageQuota', () => {
    it('allows arbitrary storage for google tier', () => {
      expect(checkStorageQuota(
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        'google',
      )).toEqual({ ok: true });
    });
  });
});

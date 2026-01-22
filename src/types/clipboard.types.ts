/**
 * Clipboard Types for Grid-to-Report Copy/Paste
 */

import type { CellValue } from '@/lib/types';

export interface GridClipboardData {
  headers: string[];
  columnIds: string[];
  rows: CellValue[][];
  sourceTableId: string;
  sourceTableName: string;
  timestamp: number;
}

// Extend Window interface for global clipboard storage
declare global {
  interface Window {
    __gridClipboard?: GridClipboardData;
  }
}

export {};

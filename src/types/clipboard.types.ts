import type { CellValue } from '@/types';

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

import type { RowSelectionMode } from '../tableData';

export interface EmbeddedTableNodeAttrs {
  sourceTableId: string;
  selectedColumns: string[];
  rowSelectionMode: RowSelectionMode;
  rowLimit: number;
  caption?: string;
}

export interface EmbeddedTableNodeOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
}

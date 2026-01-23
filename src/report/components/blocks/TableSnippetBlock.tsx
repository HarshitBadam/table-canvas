/**
 * TableSnippetBlock Component
 * 
 * Embeds a table snippet in the report.
 * Clean, minimal design with configuration options.
 * Supports two display modes: 'full' (default table) and 'embedded' (compact MiniTableView)
 */

import { useState, useCallback, useMemo } from 'react';
import { useReportStore } from '../../reportStore';
import { useDataStore } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import { MiniTableView } from '@/canvas/nodes/MiniTableView';
import type { TableSnippetBlock as TableSnippetBlockType, RowSelectionMode, TableDisplayMode } from '../../types';
import type { TableNode, ColumnSchema } from '@/lib/types';

interface TableSnippetBlockProps {
  block: TableSnippetBlockType;
  reportId: string;
  isSelected: boolean;
  onOpenTable?: (tableId: string) => void;
}

export function TableSnippetBlock({ block, reportId, isSelected, onOpenTable }: TableSnippetBlockProps) {
  const updateBlock = useReportStore((state) => state.updateBlock);
  const tableDataEntry = useDataStore((state) => state.tableData[block.sourceTableId]);
  const tableData = tableDataEntry?.rows || [];
  const tableNode = useProjectStore((state) => state.nodes[block.sourceTableId]) as TableNode | undefined;
  
  const [showConfig, setShowConfig] = useState(false);

  // Get columns from schema - we need both id and name
  const schemaColumns: ColumnSchema[] = useMemo(() => {
    return tableNode?.schema?.columns || [];
  }, [tableNode]);

  // Column IDs for data access
  const allColumnIds = useMemo(() => {
    return schemaColumns.map(c => c.id);
  }, [schemaColumns]);

  // Map column ID to display name
  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    schemaColumns.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [schemaColumns]);

  // Filter and slice data
  const displayData = useMemo(() => {
    let data = tableData;
    
    // Apply row selection
    const limit = block.rowLimit || 10;
    if (block.rowSelectionMode === 'first_n' && limit) {
      data = data.slice(0, limit);
    } else if (block.rowSelectionMode === 'last_n' && limit) {
      data = data.slice(-limit);
    }
    // 'all' mode shows all data
    
    return data;
  }, [tableData, block.rowSelectionMode, block.rowLimit]);

  // Columns to display (use column IDs)
  const displayColumnIds = block.selectedColumns.length > 0 ? block.selectedColumns : allColumnIds;

  const handleColumnToggle = useCallback((columnId: string) => {
    const newColumns = block.selectedColumns.includes(columnId)
      ? block.selectedColumns.filter(c => c !== columnId)
      : [...block.selectedColumns, columnId];
    updateBlock(reportId, block.id, { selectedColumns: newColumns });
  }, [reportId, block.id, block.selectedColumns, updateBlock]);

  const handleRowSelectionChange = useCallback((selection: RowSelectionMode) => {
    updateBlock(reportId, block.id, { 
      rowSelectionMode: selection,
      rowLimit: selection === 'all' ? undefined : block.rowLimit || 10,
    });
  }, [reportId, block.id, block.rowLimit, updateBlock]);

  const handleRowLimitChange = useCallback((limit: number) => {
    updateBlock(reportId, block.id, { rowLimit: limit });
  }, [reportId, block.id, updateBlock]);

  const handleDisplayModeChange = useCallback((mode: TableDisplayMode) => {
    updateBlock(reportId, block.id, { displayMode: mode });
  }, [reportId, block.id, updateBlock]);

  const displayMode = block.displayMode || 'full';

  // No data state
  if (!tableData.length) {
    return (
      <div className="py-8 px-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center">
        <div className="text-3xl mb-2">📋</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {tableNode ? `No data in "${tableNode.name}"` : 'Table not found'}
        </p>
        {tableNode && onOpenTable && (
          <button
            onClick={() => onOpenTable(block.sourceTableId)}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Open table
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Caption */}
      {block.caption && (
        <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {block.caption}
        </div>
      )}

      {/* Embedded Mode - MiniTableView style */}
      {displayMode === 'embedded' ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <MiniTableView
            tableId={block.sourceTableId}
            columns={schemaColumns.filter(c => displayColumnIds.includes(c.id))}
            maxHeight={220}
          />
        </div>
      ) : (
        /* Full Mode - Standard table */
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {displayColumnIds.map(colId => (
                  <th 
                    key={colId} 
                    className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300"
                  >
                    {columnNames[colId] || colId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, i) => (
                <tr 
                  key={row.__rowId || i} 
                  className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  {displayColumnIds.map(colId => (
                    <td 
                      key={colId} 
                      className="px-4 py-2 text-gray-900 dark:text-gray-100"
                    >
                      {formatCellValue(row[colId])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>
          {displayData.length} of {tableData.length} rows from {tableNode?.name || 'Unknown'}
        </span>
        
        {isSelected && (
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure
          </button>
        )}
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Table Settings
          </h4>
          
          {/* Display Mode */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
              Display mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleDisplayModeChange('full')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                  displayMode === 'full'
                    ? 'bg-accent-green/10 text-accent-green border border-accent-green'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Full Table
              </button>
              <button
                onClick={() => handleDisplayModeChange('embedded')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                  displayMode === 'embedded'
                    ? 'bg-accent-green/10 text-accent-green border border-accent-green'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Embedded
              </button>
            </div>
          </div>
          
          {/* Row Selection - only show for full mode */}
          {displayMode === 'full' && (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
                Rows to show
              </label>
              <div className="flex gap-2">
                {(['all', 'first_n', 'last_n'] as const).map(option => (
                  <button
                    key={option}
                    onClick={() => handleRowSelectionChange(option)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      block.rowSelectionMode === option
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {option === 'all' ? 'All' : option === 'first_n' ? 'First N' : 'Last N'}
                  </button>
                ))}
              </div>
              
              {block.rowSelectionMode !== 'all' && (
                <input
                  type="number"
                  value={block.rowLimit || 10}
                  onChange={(e) => handleRowLimitChange(parseInt(e.target.value) || 10)}
                  min={1}
                  max={tableData.length}
                  className="mt-2 w-20 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              )}
            </div>
          )}
          
          {/* Column Selection */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
              Columns ({block.selectedColumns.length || allColumnIds.length} selected)
            </label>
            <div className="flex flex-wrap gap-2">
              {schemaColumns.map(col => (
                <button
                  key={col.id}
                  onClick={() => handleColumnToggle(col.id)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    block.selectedColumns.length === 0 || block.selectedColumns.includes(col.id)
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {col.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}

export default TableSnippetBlock;

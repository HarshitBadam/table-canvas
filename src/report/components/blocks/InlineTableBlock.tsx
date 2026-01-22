/**
 * InlineTableBlock Component
 * 
 * Displays pasted tabular data in the report.
 * Read-only table with clean styling.
 */

import { useMemo, memo } from 'react';
import type { InlineTableBlock as InlineTableBlockType } from '../../types';

interface InlineTableBlockProps {
  block: InlineTableBlockType;
  reportId: string;
  isSelected: boolean;
}

export const InlineTableBlock = memo(function InlineTableBlock({ block, isSelected }: InlineTableBlockProps) {
  const { headers, rows } = block.data;
  
  // Format cell value for display
  const formatCellValue = useMemo(() => (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    return String(value);
  }, []);

  if (!headers.length || !rows.length) {
    return (
      <div className="py-8 px-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center">
        <div className="text-3xl mb-2">📋</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Empty table
        </p>
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

      {/* Table */}
      <div className={`overflow-x-auto rounded-lg border ${
        isSelected 
          ? 'border-accent-green shadow-sm' 
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {headers.map((header, i) => (
                <th 
                  key={i} 
                  className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr 
                key={rowIndex} 
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {row.map((cell, cellIndex) => (
                  <td 
                    key={cellIndex} 
                    className={`px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap ${
                      typeof cell === 'number' ? 'text-right font-mono tabular-nums' : ''
                    }`}
                  >
                    {formatCellValue(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>
          {rows.length} row{rows.length !== 1 ? 's' : ''} × {headers.length} column{headers.length !== 1 ? 's' : ''}
          {block.sourceInfo && (
            <span className="ml-1">
              from <span className="text-gray-500 dark:text-gray-400">{block.sourceInfo.tableName}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
});

export default InlineTableBlock;

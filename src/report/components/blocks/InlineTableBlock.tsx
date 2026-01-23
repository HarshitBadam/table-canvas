/**
 * InlineTableBlock Component
 * 
 * Displays pasted tabular data - Excel-like styling.
 */

import { useMemo, memo } from 'react';
import type { InlineTableBlock as InlineTableBlockType } from '../../types';

interface InlineTableBlockProps {
  block: InlineTableBlockType;
  reportId: string;
  isSelected: boolean;
}

export const InlineTableBlock = memo(function InlineTableBlock({ block }: InlineTableBlockProps) {
  const { headers, rows } = block.data;
  
  const formatCellValue = useMemo(() => (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }, []);

  if (!headers.length || !rows.length) {
    return (
      <div className="my-2 py-4 text-center text-gray-500 border border-dashed border-gray-300">
        Empty table
      </div>
    );
  }

  return (
    <div className="my-2">
      {block.caption && (
        <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">
          {block.caption}
        </div>
      )}

      <table className="w-full border-collapse text-sm" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th 
                key={i} 
                className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-left font-medium text-gray-900 dark:text-gray-100"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td 
                  key={cellIndex} 
                  className={`border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-900 dark:text-gray-100 ${
                    typeof cell === 'number' ? 'text-right font-mono' : ''
                  }`}
                >
                  {formatCellValue(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1 text-xs text-gray-500">
        {rows.length} × {headers.length}
        {block.sourceInfo && (
          <span className="ml-1">from {block.sourceInfo.tableName}</span>
        )}
      </div>
    </div>
  );
});

export default InlineTableBlock;

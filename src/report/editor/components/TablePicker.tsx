/**
 * TablePicker - Dropdown to select a table
 * 
 * Used in chart and embedded table configuration.
 */

import { memo, useState, useRef, useEffect } from 'react';
import { useProjectStore } from '@/state/projectStore';
import type { TableNode as TableNodeType } from '@/lib/types';

interface TablePickerProps {
  value?: string;
  onChange: (tableId: string) => void;
  placeholder?: string;
  className?: string;
}

export const TablePicker = memo(function TablePicker({
  value,
  onChange,
  placeholder = 'Select a table...',
  className = '',
}: TablePickerProps) {
  const nodes = useProjectStore((state) => state.nodes);
  const tables = Object.values(nodes).filter(n => 'type' in n && n.type === 'table') as TableNodeType[];
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTable = tables.find(t => t.id === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (tables.length === 0) {
    return (
      <div className={`text-sm text-gray-400 ${className}`}>
        No tables available
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      >
        <span className={selectedTable ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
          {selectedTable?.name || placeholder}
        </span>
        <svg 
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
          {tables.map(table => (
            <button
              key={table.id}
              onClick={() => {
                onChange(table.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                table.id === value ? 'bg-gray-50 dark:bg-gray-700' : ''
              }`}
            >
              <span className="text-lg">📋</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {table.name}
                </div>
                <div className="text-xs text-gray-400">
                  {table.schema?.columns?.length || 0} columns
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default TablePicker;

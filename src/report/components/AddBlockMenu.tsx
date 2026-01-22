/**
 * AddBlockMenu Component
 * 
 * Notion-like menu for adding new blocks.
 * Clean, searchable dropdown.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '@/state/projectStore';
import type { NewBlock } from '../types';

interface AddBlockMenuProps {
  onAdd: (block: NewBlock) => void;
  onClose: () => void;
}

interface BlockOption {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'basic' | 'data';
  needsTable?: boolean;
}

// Icons - defined before blockOptions to avoid hoisting issues
function TextIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

function HeadingIcon({ level }: { level: number }) {
  return (
    <span className="text-sm font-bold">H{level}</span>
  );
}

function DividerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function BlankTableIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 9h16M4 13h16M4 17h16M9 4v16M14 4v16" />
    </svg>
  );
}

const blockOptions: BlockOption[] = [
  {
    type: 'text',
    label: 'Text',
    description: 'Plain text with formatting',
    icon: <TextIcon />,
    category: 'basic',
  },
  {
    type: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: <HeadingIcon level={1} />,
    category: 'basic',
  },
  {
    type: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: <HeadingIcon level={2} />,
    category: 'basic',
  },
  {
    type: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: <HeadingIcon level={3} />,
    category: 'basic',
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Visual separator',
    icon: <DividerIcon />,
    category: 'basic',
  },
  {
    type: 'chart',
    label: 'Chart',
    description: 'Visualize table data',
    icon: <ChartIcon />,
    category: 'data',
    needsTable: true,
  },
  {
    type: 'table',
    label: 'Table Snippet',
    description: 'Embed table data',
    icon: <TableIcon />,
    category: 'data',
    needsTable: true,
  },
  {
    type: 'blank_table',
    label: 'Blank Table',
    description: 'Create empty editable table',
    icon: <BlankTableIcon />,
    category: 'data',
  },
];

export function AddBlockMenu({ onAdd, onClose }: AddBlockMenuProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [pendingBlockType, setPendingBlockType] = useState<string | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get tables from project store
  const nodes = useProjectStore((state) => state.nodes);
  const tableNodes = Object.values(nodes).filter(
    n => n.kind === 'source_table' || n.kind === 'derived_table'
  );

  // Filter options by search
  const filteredOptions = blockOptions.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.description.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const basicOptions = filteredOptions.filter(o => o.category === 'basic');
  const dataOptions = filteredOptions.filter(o => o.category === 'data');

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (pendingBlockType) {
        setPendingBlockType(null);
        setSelectedTable(null);
      } else {
        onClose();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pendingBlockType && selectedTable) {
        handleAddWithTable(pendingBlockType, selectedTable);
      } else if (filteredOptions[selectedIndex]) {
        handleOptionSelect(filteredOptions[selectedIndex]);
      }
    }
  }, [filteredOptions, selectedIndex, pendingBlockType, selectedTable, onClose]);

  const handleOptionSelect = useCallback((option: BlockOption) => {
    if (option.needsTable) {
      if (tableNodes.length === 0) {
        // No tables available
        return;
      }
      setPendingBlockType(option.type);
      if (tableNodes.length === 1) {
        // Only one table, select it automatically
        handleAddWithTable(option.type, tableNodes[0].id);
      }
    } else {
      // Create block directly
      let block: NewBlock;
      switch (option.type) {
        case 'text':
          block = { type: 'text', content: '' };
          break;
        case 'heading1':
          block = { type: 'heading', level: 1, content: '' };
          break;
        case 'heading2':
          block = { type: 'heading', level: 2, content: '' };
          break;
        case 'heading3':
          block = { type: 'heading', level: 3, content: '' };
          break;
        case 'divider':
          block = { type: 'divider' };
          break;
        case 'blank_table':
          block = {
            type: 'table_blank',
            rowCount: 3,
            columnCount: 3,
            data: {
              headers: ['Column 1', 'Column 2', 'Column 3'],
              rows: [
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
              ],
            },
          };
          break;
        default:
          return;
      }
      onAdd(block);
    }
  }, [tableNodes, onAdd]);

  const handleAddWithTable = useCallback((type: string, tableId: string) => {
    let block: NewBlock;
    if (type === 'chart') {
      block = {
        type: 'chart',
        sourceTableId: tableId,
        chartType: 'bar',
        config: {
          xAxis: '',
          yAxis: '',
          aggregation: 'sum',
          showLegend: true,
          showGrid: true,
        },
      };
    } else {
      block = {
        type: 'table_snippet',
        sourceTableId: tableId,
        selectedColumns: [],
        rowSelectionMode: 'first_n',
        rowLimit: 10,
      };
    }
    onAdd(block);
  }, [onAdd]);

  // Table selection view
  if (pendingBlockType) {
    return (
      <div
        ref={menuRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Select a table
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {tableNodes.map((table) => (
              <button
                key={table.id}
                onClick={() => handleAddWithTable(pendingBlockType, table.id)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                  selectedTable === table.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <TableIcon />
                </div>
                <div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">{table.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {table.schema?.rowCount || 0} rows
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setPendingBlockType(null);
                setSelectedTable(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 overflow-hidden">
        {/* Search input */}
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search blocks..."
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border-none rounded-md outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>

        {/* Options */}
        <div className="max-h-80 overflow-y-auto">
          {basicOptions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Basic
              </div>
              {basicOptions.map((option) => (
                <BlockOptionItem
                  key={option.type}
                  option={option}
                  isSelected={filteredOptions.indexOf(option) === selectedIndex}
                  onClick={() => handleOptionSelect(option)}
                />
              ))}
            </div>
          )}

          {dataOptions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mt-2">
                Data
              </div>
              {dataOptions.map((option) => (
                <BlockOptionItem
                  key={option.type}
                  option={option}
                  isSelected={filteredOptions.indexOf(option) === selectedIndex}
                  onClick={() => handleOptionSelect(option)}
                  disabled={option.needsTable && tableNodes.length === 0}
                />
              ))}
            </div>
          )}

          {filteredOptions.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No blocks found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Block option item
function BlockOptionItem({ 
  option, 
  isSelected, 
  onClick, 
  disabled 
}: { 
  option: BlockOption; 
  isSelected: boolean; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-2 text-left flex items-center gap-3 transition-colors ${
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : isSelected 
            ? 'bg-blue-50 dark:bg-blue-900/20' 
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <div className="w-10 h-10 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300">
        {option.icon}
      </div>
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {option.label}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {option.description}
        </div>
      </div>
    </button>
  );
}

export default AddBlockMenu;

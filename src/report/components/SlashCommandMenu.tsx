/**
 * SlashCommandMenu Component
 * 
 * Notion-like slash command menu that appears inline when user types '/'.
 * Features:
 * - Positioned at cursor location
 * - Filterable by typing after '/'
 * - Keyboard navigable (arrow keys, enter, escape)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useProjectStore } from '@/state/projectStore';

interface SlashCommand {
  key: string;
  label: string;
  description: string;
  shortcut: string;
  icon: React.ReactNode;
  category: 'basic' | 'data';
  needsTable?: boolean;
}

interface SlashCommandMenuProps {
  position: { x: number; y: number };
  filterText: string;
  onSelect: (commandKey: string, tableId?: string) => void;
  onClose: () => void;
}

// Icons - defined before slashCommands to avoid hoisting issues
function TextIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

function HeadingIcon({ level }: { level: number }) {
  return (
    <span className="text-xs font-bold">H{level}</span>
  );
}

function DividerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function EmbedIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

// All available slash commands
const slashCommands: SlashCommand[] = [
  {
    key: 'text',
    label: 'Text',
    description: 'Plain text block',
    shortcut: '/text',
    icon: <TextIcon />,
    category: 'basic',
  },
  {
    key: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    shortcut: '/h1',
    icon: <HeadingIcon level={1} />,
    category: 'basic',
  },
  {
    key: 'h2',
    label: 'Heading 2',
    description: 'Medium heading',
    shortcut: '/h2',
    icon: <HeadingIcon level={2} />,
    category: 'basic',
  },
  {
    key: 'h3',
    label: 'Heading 3',
    description: 'Small heading',
    shortcut: '/h3',
    icon: <HeadingIcon level={3} />,
    category: 'basic',
  },
  {
    key: 'divider',
    label: 'Divider',
    description: 'Horizontal line separator',
    shortcut: '/divider',
    icon: <DividerIcon />,
    category: 'basic',
  },
  {
    key: 'table',
    label: 'Blank Table',
    description: 'Create editable table',
    shortcut: '/table',
    icon: <TableIcon />,
    category: 'data',
  },
  {
    key: 'chart',
    label: 'Chart',
    description: 'Visualize data from table',
    shortcut: '/chart',
    icon: <ChartIcon />,
    category: 'data',
    needsTable: true,
  },
  {
    key: 'embed',
    label: 'Embed Table',
    description: 'Embed table data',
    shortcut: '/embed',
    icon: <EmbedIcon />,
    category: 'data',
    needsTable: true,
  },
];

export function SlashCommandMenu({
  position,
  filterText,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);

  // Get tables from project store
  const nodes = useProjectStore((state) => state.nodes);
  const tableNodes = useMemo(() => 
    Object.values(nodes).filter(n => n.kind === 'source_table' || n.kind === 'derived_table'),
    [nodes]
  );

  // Filter commands based on filterText
  const filteredCommands = useMemo(() => {
    if (!filterText) return slashCommands;
    const search = filterText.toLowerCase();
    return slashCommands.filter(cmd =>
      cmd.label.toLowerCase().includes(search) ||
      cmd.shortcut.toLowerCase().includes(search) ||
      cmd.description.toLowerCase().includes(search)
    );
  }, [filterText]);

  // Group by category
  const basicCommands = filteredCommands.filter(c => c.category === 'basic');
  const dataCommands = filteredCommands.filter(c => c.category === 'data');

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  // Handle command selection
  const handleCommandSelect = useCallback((cmd: SlashCommand) => {
    if (cmd.needsTable) {
      if (tableNodes.length === 0) {
        // No tables available - show message?
        return;
      }
      if (tableNodes.length === 1) {
        // Auto-select the only table
        onSelect(cmd.key, tableNodes[0].id);
      } else {
        // Show table picker
        setPendingCommand(cmd.key);
        setShowTablePicker(true);
      }
    } else {
      onSelect(cmd.key);
    }
  }, [tableNodes, onSelect]);

  // Handle table selection for commands that need it
  const handleTableSelect = useCallback((tableId: string) => {
    if (pendingCommand) {
      onSelect(pendingCommand, tableId);
    }
    setShowTablePicker(false);
    setPendingCommand(null);
  }, [pendingCommand, onSelect]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTablePicker) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowTablePicker(false);
          setPendingCommand(null);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleCommandSelect(filteredCommands[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, showTablePicker, handleCommandSelect, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Table picker view
  if (showTablePicker) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-white dark:bg-gray-800 shadow border border-gray-300 dark:border-gray-600 w-52"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500">
          Select a table
        </div>
        <div className="max-h-48 overflow-y-auto">
          {tableNodes.map((table) => (
            <button
              key={table.id}
              onClick={() => handleTableSelect(table.id)}
              className="w-full px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
            >
              <div className="text-gray-900 dark:text-gray-100">{table.name}</div>
              <div className="text-xs text-gray-500">{table.schema?.rowCount || 0} rows</div>
            </button>
          ))}
        </div>
        <div className="px-2 py-1 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { setShowTablePicker(false); setPendingCommand(null); }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Main command menu
  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 shadow border border-gray-300 dark:border-gray-600 w-52"
      style={{ left: position.x, top: position.y }}
    >
      {filteredCommands.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No commands found
          </p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {basicCommands.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Basic
              </div>
              {basicCommands.map((cmd) => {
                const absoluteIndex = filteredCommands.indexOf(cmd);
                return (
                  <CommandItem
                    key={cmd.key}
                    command={cmd}
                    isSelected={absoluteIndex === selectedIndex}
                    onClick={() => handleCommandSelect(cmd)}
                  />
                );
              })}
            </div>
          )}
          
          {dataCommands.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-1">
                Data
              </div>
              {dataCommands.map((cmd) => {
                const absoluteIndex = filteredCommands.indexOf(cmd);
                const disabled = cmd.needsTable && tableNodes.length === 0;
                return (
                  <CommandItem
                    key={cmd.key}
                    command={cmd}
                    isSelected={absoluteIndex === selectedIndex}
                    onClick={() => handleCommandSelect(cmd)}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Hint */}
      <div className="px-2 py-1 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400">
        ↑↓ navigate · Enter select · Esc close
      </div>
    </div>
  );
}

// Command item component
function CommandItem({
  command,
  isSelected,
  onClick,
  disabled,
}: {
  command: SlashCommand;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-2 py-1 text-left flex items-center gap-2 text-sm ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isSelected
            ? 'bg-accent-green/10 text-accent-green'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <span className={`w-5 h-5 flex items-center justify-center text-xs ${
        isSelected ? 'text-accent-green' : 'text-gray-400'
      }`}>
        {command.icon}
      </span>
      <span className={isSelected ? 'text-accent-green' : 'text-gray-900 dark:text-gray-100'}>
        {command.label}
      </span>
    </button>
  );
}

export default SlashCommandMenu;

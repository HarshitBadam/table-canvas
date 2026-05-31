import { useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import type { TableNode as TableNodeType } from '@/types';
import { TablePickerModal } from './TablePickerModal';

export function TableSelector({ onSelect }: { onSelect: (tableId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const nodes = useProjectStore((state) => state.nodes);
  const tables = Object.values(nodes).filter((n): n is TableNodeType => 
    n.kind === 'source_table' || n.kind === 'derived_table'
  );

  if (tables.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-2">No tables available. Import data first.</p>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-3 px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Select Table
      </button>
      
      {isOpen && (
        <TablePickerModal
          tables={tables}
          onSelect={(tableId) => {
            onSelect(tableId);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}


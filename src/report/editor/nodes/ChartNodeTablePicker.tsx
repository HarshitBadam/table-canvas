import { useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import type { TableNode as TableNodeType } from '@/types';

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

function TablePickerModal({ 
  tables, 
  onSelect, 
  onClose 
}: { 
  tables: TableNodeType[];
  onSelect: (tableId: string) => void;
  onClose: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-2xl w-[380px] max-h-[70vh] overflow-hidden"
        style={{ 
          animation: 'modalSlideIn 0.2s ease-out',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-green rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Select Table
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Choose data source for your chart
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-3 max-h-[400px] overflow-y-auto">
          <div className="space-y-1">
            {tables.map(table => (
              <button
                key={table.id}
                onClick={() => onSelect(table.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all hover:bg-accent-green/8 group"
              >
                <div className="w-9 h-9 rounded-lg bg-accent-green/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent-green/15 transition-colors">
                  <svg className="w-4 h-4 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {table.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {table.schema?.rowCount?.toLocaleString() || 0} rows · {table.schema?.columns?.length || 0} columns
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-accent-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

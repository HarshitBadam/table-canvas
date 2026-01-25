/**
 * ChartNode - TipTap Custom Node for Charts
 * 
 * Renders chart blocks with configuration panel.
 * States: empty, configured, selected, configuring
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useDataStore } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import { ChartRenderer } from '@/charts/ChartRenderer';
import type { EnhancedChartConfig } from '../../types';
import type { TableNode as TableNodeType, ColumnSchema } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

interface ChartNodeAttrs {
  sourceTableId: string;
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  config: EnhancedChartConfig;
}

interface ChartNodeOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
}

// ============================================================================
// React Component
// ============================================================================

const ChartNodeView = memo(function ChartNodeView({ 
  node, 
  updateAttributes,
  selected,
  extension,
  deleteNode,
}: NodeViewProps) {
  const attrs = node.attrs as ChartNodeAttrs;
  const options = extension.options as ChartNodeOptions;
  
  const tableDataEntry = useDataStore((state) => state.tableData[attrs.sourceTableId]);
  const tableData = tableDataEntry?.rows || [];
  const tableNode = useProjectStore((state) => state.nodes[attrs.sourceTableId]) as TableNodeType | undefined;
  
  const [showConfig, setShowConfig] = useState(false);
  const hasAutoConfigured = useRef(false);

  // Get columns from table schema
  const columns: ColumnSchema[] = useMemo(() => {
    return tableNode?.schema?.columns || [];
  }, [tableNode]);

  // Map column ID to name for display
  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [columns]);

  // Auto-configure axes if not set
  useEffect(() => {
    if (hasAutoConfigured.current) return;
    if (columns.length === 0 || tableData.length === 0) return;
    
    const needsUpdate = !attrs.config.xAxis || !attrs.config.yAxis;
    if (!needsUpdate) {
      hasAutoConfigured.current = true;
      return;
    }
    
    const stringCol = columns.find(c => c.type === 'string' || c.type === 'date');
    const numberCol = columns.find(c => c.type === 'number');
    
    if (stringCol || numberCol) {
      const updates: Partial<EnhancedChartConfig> = {};
      if (!attrs.config.xAxis && stringCol) {
        updates.xAxis = stringCol.id;
      } else if (!attrs.config.xAxis && columns[0]) {
        updates.xAxis = columns[0].id;
      }
      if (!attrs.config.yAxis && numberCol) {
        updates.yAxis = numberCol.id;
      } else if (!attrs.config.yAxis && columns[1]) {
        updates.yAxis = columns[1].id;
      }
      
      if (Object.keys(updates).length > 0) {
        updateAttributes({
          config: { ...attrs.config, ...updates },
        });
      }
    }
    
    hasAutoConfigured.current = true;
  }, [columns, tableData.length, attrs.config, updateAttributes]);

  const handleConfigChange = useCallback((updates: Partial<EnhancedChartConfig>) => {
    updateAttributes({
      config: { ...attrs.config, ...updates },
    });
  }, [attrs.config, updateAttributes]);

  const handleChartTypeChange = useCallback((chartType: 'bar' | 'line' | 'pie' | 'scatter') => {
    updateAttributes({ chartType });
  }, [updateAttributes]);

  const canRender = tableData.length > 0 && attrs.config.xAxis && attrs.config.yAxis;

  // No source table selected - empty state
  if (!attrs.sourceTableId) {
    return (
      <NodeViewWrapper className="chart-block">
        <div 
          className={`
            flex flex-col items-center justify-center text-center transition-all
            p-10 rounded-xl border border-dashed
            ${selected 
              ? 'border-accent-green bg-accent-green/5 ring-2 ring-accent-green ring-offset-2' 
              : 'border-gray-200 dark:border-gray-700 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50'
            }
          `}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green/15 to-accent-green/5 flex items-center justify-center mb-3 text-accent-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Add Chart
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Visualize data from your tables
          </div>
          <TableSelector 
            onSelect={(tableId) => updateAttributes({ sourceTableId: tableId })}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  // No data state
  if (!tableData.length) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <div className="block-empty-state-icon">📊</div>
          <div className="block-empty-state-title">No Data</div>
          <div className="block-empty-state-description">
            {tableNode ? `No data in "${tableNode.name}"` : 'Table not found'}
          </div>
          {tableNode && options.onOpenTable && (
            <button
              onClick={() => options.onOpenTable?.(attrs.sourceTableId)}
              className="text-sm text-accent-green hover:underline mt-2"
            >
              Open table
            </button>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  // Not configured state
  if (!canRender) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
          <div className="chart-block-container">
            <div className="chart-block-body" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="text-3xl mb-2 opacity-60">📊</div>
              <p className="text-sm text-gray-500 mb-3">
                Configure chart axes to display data
              </p>
              <button
                onClick={() => setShowConfig(true)}
                className="btn btn-primary btn-sm"
              >
                Configure Chart
              </button>
            </div>
          </div>
          
          {showConfig && (
            <ChartConfigPanel
              config={attrs.config}
              chartType={attrs.chartType}
              columns={columns}
              onConfigChange={handleConfigChange}
              onChartTypeChange={handleChartTypeChange}
              onClose={() => setShowConfig(false)}
            />
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  // Configured and rendering
  return (
    <NodeViewWrapper className="chart-block" data-drag-handle>
      <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
        <div className="chart-block-container relative group overflow-hidden">
          {/* Full-area grid background */}
          {attrs.config.showGrid !== false && (
            <div 
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
          )}
          
          {/* Floating toolbar when selected or hovered */}
          <div className={`
            absolute -top-10 left-1/2 -translate-x-1/2 z-20
            flex items-center gap-1 px-2 py-1.5 rounded-lg
            bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700
            transition-all duration-150
            ${selected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'}
          `}>
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-accent-green dark:hover:text-accent-green hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Configure chart"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
            <button
              onClick={() => deleteNode()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Delete chart (Backspace)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          
          {/* Header with title */}
          {(attrs.config.title || attrs.config.subtitle) && (
            <div className="chart-block-header relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
              {attrs.config.title && (
                <div className="chart-block-title">{attrs.config.title}</div>
              )}
              {attrs.config.subtitle && (
                <div className="chart-block-subtitle">{attrs.config.subtitle}</div>
              )}
            </div>
          )}

          {/* Chart */}
          <div className="chart-block-body relative z-10">
            <ChartRenderer
              type={attrs.chartType}
              config={{
                xAxis: attrs.config.xAxis,
                yAxis: attrs.config.yAxis,
                series: attrs.config.series,
                aggregation: attrs.config.aggregation,
                groupBy: attrs.config.groupBy,
              }}
              data={tableData}
              colorScheme={attrs.config.colorScheme}
              showGrid={false}
              showLegend={attrs.config.showLegend}
              columnNames={columnNames}
            />
          </div>

          {/* Footer */}
          <div className="chart-block-footer relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <span>Source: {tableNode?.name || 'Unknown table'}</span>
            <button
              onClick={() => setShowConfig(true)}
              className="text-xs text-accent-green hover:text-accent-green-hover flex items-center gap-1 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <ChartConfigPanel
            config={attrs.config}
            chartType={attrs.chartType}
            columns={columns}
            onConfigChange={handleConfigChange}
            onChartTypeChange={handleChartTypeChange}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
});

// ============================================================================
// Table Selector Component - Popup Style
// ============================================================================

function TableSelector({ onSelect }: { onSelect: (tableId: string) => void }) {
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

// Table Picker Modal - Clean popup design
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
        {/* Header */}
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
        
        {/* Table List */}
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

// ============================================================================
// Chart Config Panel Component
// ============================================================================

interface ChartConfigPanelProps {
  config: EnhancedChartConfig;
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  columns: ColumnSchema[];
  onConfigChange: (updates: Partial<EnhancedChartConfig>) => void;
  onChartTypeChange: (type: 'bar' | 'line' | 'pie' | 'scatter') => void;
  onClose: () => void;
}

function ChartConfigPanel({
  config,
  chartType,
  columns,
  onConfigChange,
  onChartTypeChange,
  onClose,
}: ChartConfigPanelProps) {
  // Filter columns based on chart type
  const xAxisColumns = chartType === 'scatter' 
    ? columns.filter(c => c.type === 'number')
    : columns;
  const yAxisColumns = columns.filter(c => c.type === 'number');

  return (
    <div className="block-config-panel">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-sm text-gray-900 dark:text-white">Chart Configuration</h4>
        <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chart Type */}
      <div className="block-config-section">
        <label className="block-config-label">Chart Type</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { type: 'bar' as const, label: 'Bar' },
            { type: 'line' as const, label: 'Line' },
            { type: 'pie' as const, label: 'Pie' },
            { type: 'scatter' as const, label: 'Scatter' },
          ].map(({ type, label }) => (
            <button
              key={type}
              onClick={() => onChartTypeChange(type)}
              className={`
                flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border transition-all
                ${chartType === type
                  ? 'border-accent-green bg-accent-green/5 text-accent-green'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
            >
              <ChartTypeIcon type={type} className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* X Axis */}
      <div className="block-config-section">
        <label className="block-config-label">
          {chartType === 'scatter' ? 'X Axis (Numeric)' : 'X Axis'}
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {xAxisColumns.slice(0, 8).map(col => (
            <button
              key={col.id}
              onClick={() => onConfigChange({ xAxis: col.id })}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                ${config.xAxis === col.id
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
            >
              {col.name}
            </button>
          ))}
        </div>
      </div>

      {/* Y Axis */}
      <div className="block-config-section">
        <label className="block-config-label">Y Axis (Numeric)</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {yAxisColumns.slice(0, 8).map(col => (
            <button
              key={col.id}
              onClick={() => onConfigChange({ yAxis: col.id })}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                ${config.yAxis === col.id
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
            >
              {col.name}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="block-config-section">
        <label className="block-config-label">Title (optional)</label>
        <input
          type="text"
          value={config.title || ''}
          onChange={(e) => onConfigChange({ title: e.target.value })}
          placeholder="Chart title"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green transition-colors"
        />
      </div>

      {/* Options */}
      <div className="block-config-section">
        <label className="block-config-label">Display Options</label>
        <div className="space-y-3 mt-2">
          <ToggleSwitch
            checked={config.showLegend !== false}
            onChange={(checked) => onConfigChange({ showLegend: checked })}
            label="Show Legend"
          />
          <ToggleSwitch
            checked={config.showGrid !== false}
            onChange={(checked) => onConfigChange({ showGrid: checked })}
            label="Show Grid"
          />
        </div>
      </div>
    </div>
  );
}

// Custom Toggle Switch Component
function ToggleSwitch({ 
  checked, 
  onChange, 
  label 
}: { 
  checked: boolean; 
  onChange: (checked: boolean) => void; 
  label: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 items-center rounded-full transition-colors
          ${checked 
            ? 'bg-accent-green' 
            : 'bg-gray-200 dark:bg-gray-700'
          }
        `}
      >
        <span
          className={`
            inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform
            ${checked ? 'translate-x-4' : 'translate-x-1'}
          `}
        />
      </button>
    </label>
  );
}

// Chart Type Icon Component
function ChartTypeIcon({ type, className }: { type: 'bar' | 'line' | 'pie' | 'scatter'; className?: string }) {
  switch (type) {
    case 'bar':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
        </svg>
      );
    case 'line':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />
        </svg>
      );
    case 'pie':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
        </svg>
      );
    case 'scatter':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <circle cx="7" cy="14" r="2" />
          <circle cx="11" cy="10" r="2" />
          <circle cx="15" cy="16" r="2" />
          <circle cx="17" cy="8" r="2" />
        </svg>
      );
  }
}

// ============================================================================
// TipTap Node Definition
// ============================================================================

export const ChartNode = Node.create<ChartNodeOptions>({
  name: 'chartBlock',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,

  addOptions() {
    return {
      reportId: undefined,
      onOpenTable: undefined,
    };
  },

  addAttributes() {
    return {
      sourceTableId: {
        default: '',
      },
      chartType: {
        default: 'bar',
      },
      config: {
        default: {
          showLegend: true,
          showGrid: true,
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="chart-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        const node = selection.$anchor.parent;
        if (node.type.name === this.name || selection.$anchor.nodeAfter?.type.name === this.name) {
          return this.editor.commands.deleteSelection();
        }
        return false;
      },
      Delete: () => {
        const { selection } = this.editor.state;
        const node = selection.$anchor.parent;
        if (node.type.name === this.name || selection.$anchor.nodeAfter?.type.name === this.name) {
          return this.editor.commands.deleteSelection();
        }
        return false;
      },
    };
  },
});

export default ChartNode;

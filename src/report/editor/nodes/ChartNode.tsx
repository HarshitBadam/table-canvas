/**
 * ChartNode - TipTap Custom Node for Charts
 *
 * Renders a chart from a workspace table. Data is read through the shared
 * `useTableSource` hook (which materializes the table on demand) and drawn
 * with the app's ChartRenderer.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { ChartRenderer } from '@/charts/ChartRenderer';
import type { EnhancedChartConfig } from '../../types';
import type { ColumnSchema } from '@/lib/types';
import { useTableSource } from '../tableData';
import { TablePickerModal } from './TablePickerModal';

// ============================================================================
// Types
// ============================================================================

type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

interface ChartNodeAttrs {
  sourceTableId: string;
  chartType: ChartType;
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

  const { tableNode, columns, rows, status } = useTableSource(attrs.sourceTableId);
  const tableData = rows;

  const [showConfig, setShowConfig] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const hasAutoConfigured = useRef(false);

  // Map column ID to name for display
  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [columns]);

  // Auto-configure axes once we have columns + data
  useEffect(() => {
    if (hasAutoConfigured.current) return;
    if (columns.length === 0 || tableData.length === 0) return;

    if (attrs.config.xAxis && attrs.config.yAxis) {
      hasAutoConfigured.current = true;
      return;
    }

    const stringCol = columns.find((c) => c.type === 'string' || c.type === 'date');
    const numberCol = columns.find((c) => c.type === 'number');

    const updates: Partial<EnhancedChartConfig> = {};
    if (!attrs.config.xAxis) {
      updates.xAxis = (stringCol || columns[0])?.id;
    }
    if (!attrs.config.yAxis) {
      updates.yAxis = (numberCol || columns[1] || columns[0])?.id;
    }

    if (updates.xAxis || updates.yAxis) {
      updateAttributes({ config: { ...attrs.config, ...updates } });
    }
    hasAutoConfigured.current = true;
  }, [columns, tableData.length, attrs.config, updateAttributes]);

  const handleConfigChange = useCallback(
    (updates: Partial<EnhancedChartConfig>) => {
      updateAttributes({ config: { ...attrs.config, ...updates } });
    },
    [attrs.config, updateAttributes]
  );

  const handleChartTypeChange = useCallback(
    (chartType: ChartType) => {
      updateAttributes({ chartType });
    },
    [updateAttributes]
  );

  const handleSelectTable = useCallback(
    (tableId: string) => {
      // New table => reset axis config so it auto-configures for the new schema.
      hasAutoConfigured.current = false;
      updateAttributes({
        sourceTableId: tableId,
        config: { ...attrs.config, xAxis: undefined, yAxis: undefined },
      });
      setShowPicker(false);
    },
    [attrs.config, updateAttributes]
  );

  const picker = showPicker ? (
    <TablePickerModal
      title="Select a table"
      subtitle="Choose the data source for this chart"
      onSelect={handleSelectTable}
      onClose={() => setShowPicker(false)}
    />
  ) : null;

  const canRender = tableData.length > 0 && !!attrs.config.xAxis && !!attrs.config.yAxis;

  // ---- No source selected -------------------------------------------------
  if (status === 'no-source') {
    return (
      <NodeViewWrapper className="chart-block">
        <div
          className={`flex flex-col items-center justify-center text-center transition-all p-10 rounded-xl border border-dashed ${
            selected
              ? 'border-accent-green bg-accent-green/5 ring-2 ring-accent-green ring-offset-2'
              : 'border-gray-200 dark:border-gray-700 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green/15 to-accent-green/5 flex items-center justify-center mb-3 text-accent-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">Add Chart</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Visualize data from your tables
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Select Table
          </button>
        </div>
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Loading ------------------------------------------------------------
  if (status === 'loading') {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <svg className="w-6 h-6 animate-spin text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <div className="block-empty-state-title">Loading data…</div>
          <div className="block-empty-state-description">
            {tableNode ? `Preparing "${tableNode.name}"` : 'Preparing table'}
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // ---- Missing table / error / no data ------------------------------------
  if (status === 'missing-table' || status === 'error' || status === 'empty') {
    return (
      <NodeViewWrapper className="chart-block">
        <div
          className={`block-empty-state ${selected ? 'is-selected' : ''}`}
          onClick={() => setShowPicker(true)}
        >
          <div className="block-empty-state-icon">📊</div>
          <div className="block-empty-state-title">
            {status === 'missing-table' ? 'Table not found' : status === 'error' ? 'Could not load data' : 'No Data'}
          </div>
          <div className="block-empty-state-description">
            {status === 'missing-table'
              ? 'The linked table was removed. Click to pick another.'
              : tableNode
                ? status === 'error'
                  ? `"${tableNode.name}" failed to load. Click to pick another table.`
                  : `"${tableNode.name}" has no rows yet.`
                : 'Table not available'}
          </div>
          {tableNode && options.onOpenTable && status === 'empty' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                options.onOpenTable?.(attrs.sourceTableId);
              }}
              className="text-sm text-accent-green hover:underline mt-2"
            >
              Open table
            </button>
          )}
        </div>
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Ready but not configured ------------------------------------------
  if (!canRender) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
          <div className="chart-block-container">
            <div className="chart-block-body" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="text-3xl mb-2 opacity-60">📊</div>
              <p className="text-sm text-gray-500 mb-3">Configure chart axes to display data</p>
              <button onClick={() => setShowConfig(true)} className="btn btn-primary btn-sm">
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
              onChangeTable={() => {
                setShowConfig(false);
                setShowPicker(true);
              }}
              onClose={() => setShowConfig(false)}
            />
          )}
        </div>
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Configured and rendering ------------------------------------------
  return (
    <NodeViewWrapper className="chart-block" data-drag-handle>
      <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
        <div className="chart-block-container relative group overflow-hidden">
          {attrs.config.showGrid !== false && (
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
          )}

          {/* Floating toolbar when selected or hovered */}
          <div
            className={`absolute -top-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-150 ${
              selected
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'
            }`}
          >
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
              {attrs.config.title && <div className="chart-block-title">{attrs.config.title}</div>}
              {attrs.config.subtitle && <div className="chart-block-subtitle">{attrs.config.subtitle}</div>}
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
            onChangeTable={() => {
              setShowConfig(false);
              setShowPicker(true);
            }}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
      {picker}
    </NodeViewWrapper>
  );
});

// ============================================================================
// Chart Config Panel Component
// ============================================================================

interface ChartConfigPanelProps {
  config: EnhancedChartConfig;
  chartType: ChartType;
  columns: ColumnSchema[];
  onConfigChange: (updates: Partial<EnhancedChartConfig>) => void;
  onChartTypeChange: (type: ChartType) => void;
  onChangeTable: () => void;
  onClose: () => void;
}

function ChartConfigPanel({
  config,
  chartType,
  columns,
  onConfigChange,
  onChartTypeChange,
  onChangeTable,
  onClose,
}: ChartConfigPanelProps) {
  const xAxisColumns = chartType === 'scatter' ? columns.filter((c) => c.type === 'number') : columns;
  const yAxisColumns = columns.filter((c) => c.type === 'number');

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

      {/* Source table */}
      <div className="block-config-section">
        <label className="block-config-label">Source</label>
        <button
          onClick={onChangeTable}
          className="input text-sm w-full text-left flex items-center justify-between"
        >
          <span>Change table…</span>
          <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Chart Type */}
      <div className="block-config-section">
        <label className="block-config-label">Chart Type</label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { type: 'bar', label: 'Bar' },
            { type: 'line', label: 'Line' },
            { type: 'pie', label: 'Pie' },
            { type: 'scatter', label: 'Scatter' },
          ] as { type: ChartType; label: string }[]).map(({ type, label }) => (
            <button
              key={type}
              onClick={() => onChartTypeChange(type)}
              className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border transition-all ${
                chartType === type
                  ? 'border-accent-green bg-accent-green/5 text-accent-green'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <ChartTypeIcon type={type} className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* X Axis */}
      <div className="block-config-section">
        <label className="block-config-label">{chartType === 'scatter' ? 'X Axis (Numeric)' : 'X Axis'}</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {xAxisColumns.slice(0, 8).map((col) => (
            <button
              key={col.id}
              onClick={() => onConfigChange({ xAxis: col.id })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                config.xAxis === col.id
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
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
          {yAxisColumns.slice(0, 8).map((col) => (
            <button
              key={col.id}
              onClick={() => onConfigChange({ yAxis: col.id })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                config.yAxis === col.id
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
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
  label,
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
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-accent-green' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

// Chart Type Icon Component
function ChartTypeIcon({ type, className }: { type: ChartType; className?: string }) {
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

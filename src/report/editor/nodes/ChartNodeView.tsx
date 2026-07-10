import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChartRenderer } from '@/charts/ChartRenderer';
import type { ChartType } from '@/types';
import type { EnhancedChartConfig } from '../../types';
import { useTableSource } from '../tableData';
import { ChartConfigPanel } from './ChartConfigPanel';
import { TablePickerModal } from './TablePickerModal';
import type { ChartNodeAttrs, ChartNodeOptions } from './chartNodeTypes';

export const ChartNodeView = memo(function ChartNodeView({
  node,
  updateAttributes,
  selected,
  extension,
  deleteNode,
}: NodeViewProps) {
  const attrs = node.attrs as ChartNodeAttrs;
  const options = extension.options as ChartNodeOptions;
  const { tableNode, columns, rows: tableData, status } = useTableSource(attrs.sourceTableId);
  const [showConfig, setShowConfig] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const hasAutoConfigured = useRef(false);

  const columnNames = useMemo(
    () => Object.fromEntries(columns.map(column => [column.id, column.name])),
    [columns]
  );

  useEffect(() => {
    if (hasAutoConfigured.current || columns.length === 0 || tableData.length === 0) return;
    if (attrs.config.xAxis && attrs.config.yAxis) {
      hasAutoConfigured.current = true;
      return;
    }

    const stringColumn = columns.find(column => column.type === 'string' || column.type === 'date');
    const numberColumn = columns.find(column => column.type === 'number');
    const updates: Partial<EnhancedChartConfig> = {};
    if (!attrs.config.xAxis) updates.xAxis = (stringColumn || columns[0])?.id;
    if (!attrs.config.yAxis) updates.yAxis = (numberColumn || columns[1] || columns[0])?.id;
    if (updates.xAxis || updates.yAxis) {
      updateAttributes({ config: { ...attrs.config, ...updates } });
    }
    hasAutoConfigured.current = true;
  }, [columns, tableData.length, attrs.config, updateAttributes]);

  const handleConfigChange = useCallback((updates: Partial<EnhancedChartConfig>) => {
    updateAttributes({ config: { ...attrs.config, ...updates } });
  }, [attrs.config, updateAttributes]);

  const handleChartTypeChange = useCallback((chartType: ChartType) => {
    updateAttributes({ chartType });
  }, [updateAttributes]);

  const handleSelectTable = useCallback((tableId: string) => {
    hasAutoConfigured.current = false;
    updateAttributes({
      sourceTableId: tableId,
      config: { ...attrs.config, xAxis: undefined, yAxis: undefined },
    });
    setShowPicker(false);
  }, [attrs.config, updateAttributes]);

  const changeTable = useCallback(() => {
    setShowConfig(false);
    setShowPicker(true);
  }, []);
  const closeConfig = useCallback(() => setShowConfig(false), []);
  const openConfig = useCallback(() => setShowConfig(true), []);
  const picker = showPicker ? (
    <TablePickerModal
      title="Select a table"
      subtitle="Choose the data source for this chart"
      onSelect={handleSelectTable}
      onClose={() => setShowPicker(false)}
    />
  ) : null;

  if (status === 'no-source') {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`flex flex-col items-center justify-center text-center transition-all p-10 rounded-xl border border-dashed ${
          selected
            ? 'border-accent-green bg-accent-green/5 ring-2 ring-accent-green ring-offset-2'
            : 'border-gray-200 dark:border-gray-700 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50'
        }`}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green/15 to-accent-green/5 flex items-center justify-center mb-3 text-accent-green">
            <ChartGlyph />
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">Add Chart</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">Visualize data from your tables</div>
          <button
            onClick={() => setShowPicker(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-colors flex items-center gap-2"
          >
            <TableGlyph />
            Select Table
          </button>
        </div>
        {picker}
      </NodeViewWrapper>
    );
  }

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

  if (status === 'missing-table' || status === 'error' || status === 'empty') {
    const title = status === 'missing-table' ? 'Table not found' : status === 'error' ? 'Could not load data' : 'No Data';
    const description = status === 'missing-table'
      ? 'The linked table was removed. Click to pick another.'
      : tableNode
        ? status === 'error'
          ? `"${tableNode.name}" failed to load. Click to pick another table.`
          : `"${tableNode.name}" has no rows yet.`
        : 'Table not available';
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`} onClick={() => setShowPicker(true)}>
          <div className="block-empty-state-icon">📊</div>
          <div className="block-empty-state-title">{title}</div>
          <div className="block-empty-state-description">{description}</div>
          {tableNode && options.onOpenTable && status === 'empty' && (
            <button
              onClick={event => {
                event.stopPropagation();
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

  const configPanel = showConfig ? (
    <ChartConfigPanel
      config={attrs.config}
      chartType={attrs.chartType}
      columns={columns}
      onConfigChange={handleConfigChange}
      onChartTypeChange={handleChartTypeChange}
      onChangeTable={changeTable}
      onClose={closeConfig}
    />
  ) : null;

  if (!tableData.length || !attrs.config.xAxis || !attrs.config.yAxis) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
          <div className="chart-block-container">
            <div className="chart-block-body" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="text-3xl mb-2 opacity-60">📊</div>
              <p className="text-sm text-gray-500 mb-3">Configure chart axes to display data</p>
              <button onClick={openConfig} className="btn btn-primary btn-sm">Configure Chart</button>
            </div>
          </div>
          {configPanel}
        </div>
        {picker}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="chart-block" data-drag-handle>
      <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
        <div className="chart-block-container relative group overflow-hidden">
          {attrs.config.showGrid !== false && <ChartGrid />}
          <ChartToolbar selected={selected} onConfigure={openConfig} onDelete={deleteNode} />
          {(attrs.config.title || attrs.config.subtitle) && (
            <div className="chart-block-header relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
              {attrs.config.title && <div className="chart-block-title">{attrs.config.title}</div>}
              {attrs.config.subtitle && <div className="chart-block-subtitle">{attrs.config.subtitle}</div>}
            </div>
          )}
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
          <div className="chart-block-footer relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <span>Source: {tableNode?.name || 'Unknown table'}</span>
            <button onClick={openConfig} className="text-xs text-accent-green hover:text-accent-green-hover flex items-center gap-1 font-medium">
              <SettingsIcon />
              Configure
            </button>
          </div>
        </div>
        {configPanel}
      </div>
      {picker}
    </NodeViewWrapper>
  );
});

function ChartGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartGrid() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-0"
      style={{
        backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    />
  );
}

function ChartToolbar({ selected, onConfigure, onDelete }: {
  selected: boolean;
  onConfigure: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`absolute -top-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-150 ${
      selected
        ? 'opacity-100 translate-y-0'
        : 'opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'
    }`}>
      <button
        onClick={onConfigure}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-accent-green dark:hover:text-accent-green hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
      >
        <SettingsIcon />
        Configure
      </button>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        title="Delete chart (Backspace)"
      >
        <DeleteIcon />
      </button>
    </div>
  );
}

function TableGlyph() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

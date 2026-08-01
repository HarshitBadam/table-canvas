import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChartRenderer } from '@/charts/ChartRenderer';
import type { ChartType } from '@/types';
import type { EnhancedChartConfig } from '../../types';
import {
  aggregateReportChartRows,
  MAX_REPORT_CHART_ROWS,
  useTableSource,
} from '../tableData';
import { ChartConfigPanel } from './ChartConfigPanel';
import { TablePickerModal } from './TablePickerModal';
import {
  ChartGlyph,
  ChartGrid,
  SettingsIcon,
} from './ReportChartControls';
import type { ChartNodeAttrs, ChartNodeOptions } from './chartNodeTypes';
import { useNodeSelect } from './useNodeSelect';

export const ChartNodeView = memo(function ChartNodeView({
  node,
  updateAttributes,
  selected,
  extension,
  editor,
  getPos,
}: NodeViewProps) {
  const attrs = node.attrs as ChartNodeAttrs;
  const options = extension.options as ChartNodeOptions;
  const {
    tableNode,
    columns,
    rows: tableData,
    rowCount,
    status,
    error,
    isTruncated,
    retry,
  } = useTableSource(attrs.sourceTableId, {
    rowSelectionMode: 'first_n',
    rowLimit: MAX_REPORT_CHART_ROWS,
    maxRows: MAX_REPORT_CHART_ROWS,
  });
  const [showConfig, setShowConfig] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const columnNames = useMemo(
    () => Object.fromEntries(columns.map(column => [column.id, column.name])),
    [columns]
  );
  const chartColumnNames = useMemo(() => {
    if (!attrs.config.yAxis || !attrs.config.aggregation) return columnNames;
    const originalName = columnNames[attrs.config.yAxis] || attrs.config.yAxis;
    const prefix: Record<string, string> = {
      sum: 'Sum of',
      avg: 'Average',
      min: 'Minimum',
      max: 'Maximum',
      count: 'Count of rows',
      count_distinct: 'Distinct count of',
    };
    return {
      ...columnNames,
      [attrs.config.yAxis]: attrs.config.aggregation === 'count'
        ? prefix.count
        : `${prefix[attrs.config.aggregation]} ${originalName}`,
    };
  }, [attrs.config.aggregation, attrs.config.yAxis, columnNames]);
  const { chartData, availableChartPoints } = useMemo(() => {
    if (!attrs.config.xAxis || !attrs.config.yAxis) {
      return { chartData: [], availableChartPoints: 0 };
    }
    const preparedRows = aggregateReportChartRows(
      tableData,
      attrs.config.xAxis,
      attrs.config.yAxis,
      attrs.config.aggregation,
    );
    const validRows = preparedRows.filter((row) => {
      const yValue = row[attrs.config.yAxis!];
      if (yValue === null || yValue === '' || !Number.isFinite(Number(yValue))) return false;
      if (attrs.chartType !== 'scatter' || !attrs.config.xAxis) return true;
      const xValue = row[attrs.config.xAxis];
      return xValue !== null && xValue !== '' && Number.isFinite(Number(xValue));
    });
    return {
      chartData: validRows.slice(0, 500),
      availableChartPoints: validRows.length,
    };
  }, [
    attrs.chartType,
    attrs.config.aggregation,
    attrs.config.xAxis,
    attrs.config.yAxis,
    tableData,
  ]);

  useEffect(() => {
    if (columns.length === 0 || tableData.length === 0) return;
    const validColumnIds = new Set(columns.map(column => column.id));
    const numericColumns = columns.filter(column => column.type === 'number');
    const categoryColumn = columns.find(
      column => column.type === 'string' || column.type === 'date' || column.type === 'datetime',
    );
    const currentXAxis = attrs.config.xAxis;
    const currentYAxis = attrs.config.yAxis;
    const xAxisIsValid = currentXAxis
      && validColumnIds.has(currentXAxis)
      && (attrs.chartType !== 'scatter' || numericColumns.some(column => column.id === currentXAxis));
    const yAxisIsValid = currentYAxis
      && numericColumns.some(column => column.id === currentYAxis);
    const updates: Partial<EnhancedChartConfig> = {};
    let needsUpdate = false;
    if (!xAxisIsValid) {
      const nextXAxis = attrs.chartType === 'scatter'
        ? numericColumns[0]?.id
        : (categoryColumn || columns[0])?.id;
      if (nextXAxis !== currentXAxis) {
        updates.xAxis = nextXAxis;
        needsUpdate = true;
      }
    }
    if (!yAxisIsValid) {
      const xAxis = updates.xAxis || currentXAxis;
      const nextYAxis = numericColumns.find(column => column.id !== xAxis)?.id
        || numericColumns[0]?.id;
      if (nextYAxis !== currentYAxis) {
        updates.yAxis = nextYAxis;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      updateAttributes({ config: { ...attrs.config, ...updates } });
    }
  }, [columns, tableData.length, attrs.chartType, attrs.config, updateAttributes]);

  const handleConfigChange = useCallback((updates: Partial<EnhancedChartConfig>) => {
    updateAttributes({ config: { ...attrs.config, ...updates } });
  }, [attrs.config, updateAttributes]);

  const handleChartTypeChange = useCallback((chartType: ChartType) => {
    updateAttributes({
      chartType,
      config: chartType === 'scatter'
        ? { ...attrs.config, aggregation: undefined }
        : attrs.config,
    });
  }, [attrs.config, updateAttributes]);

  const handleSelectTable = useCallback((tableId: string) => {
    updateAttributes({
      sourceTableId: tableId,
      config: { ...attrs.config, xAxis: undefined, yAxis: undefined },
    });
    setShowPicker(false);
  }, [attrs.config, updateAttributes]);

  const changeTable = useCallback(() => {
    setShowPicker(true);
  }, []);
  const scrollToChart = useCallback(() => {
    window.requestAnimationFrame(() => {
      chartWrapperRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);
  const closeConfig = useCallback(() => {
    setShowConfig(false);
    scrollToChart();
  }, [scrollToChart]);
  const openConfig = useCallback(() => {
    if (showConfig) closeConfig();
    else setShowConfig(true);
  }, [closeConfig, showConfig]);
  const selectChart = useNodeSelect(editor, getPos);
  const picker = showPicker ? (
    <TablePickerModal
      title="Select a table to embed"
      onSelect={handleSelectTable}
      onClose={() => setShowPicker(false)}
    />
  ) : null;

  if (status === 'no-source') {
    return (
      <NodeViewWrapper className="chart-block">
        <div
          onMouseDownCapture={selectChart}
          onClick={() => setShowPicker(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setShowPicker(true);
            }
          }}
          className={`block-empty-state ${selected ? 'is-selected' : ''}`}
          role="button"
          tabIndex={0}
        >
          <ChartGlyph />
          <div className="block-empty-state-title">Add Chart</div>
          <div className="block-empty-state-description">Visualize data from your tables</div>
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
      : status === 'error' && error
        ? error
        : tableNode
        ? status === 'error'
          ? `"${tableNode.name}" failed to load. Click to pick another table.`
          : `"${tableNode.name}" has no rows yet.`
        : 'Table not available';
    return (
      <NodeViewWrapper className="chart-block">
        <div
          onMouseDownCapture={selectChart}
          className={`block-empty-state ${selected ? 'is-selected' : ''}`}
        >
          <div className="block-empty-state-icon">📊</div>
          <div className="block-empty-state-title">{title}</div>
          <div className="block-empty-state-description">{description}</div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="btn btn-secondary btn-sm mt-3"
          >
            Select table
          </button>
          {status === 'error' && (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                retry();
              }}
              className="btn btn-secondary btn-sm mt-3"
            >
              Retry
            </button>
          )}
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
      sourceName={tableNode?.name}
      onConfigChange={handleConfigChange}
      onChartTypeChange={handleChartTypeChange}
      onChangeTable={changeTable}
      onClose={closeConfig}
    />
  ) : null;

  if (!tableData.length || !attrs.config.xAxis || !attrs.config.yAxis) {
    return (
      <NodeViewWrapper className="chart-block">
        <div
          ref={chartWrapperRef}
          className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''} ${showConfig ? 'is-configuring' : ''}`}
        >
          <div className="chart-block-container" onMouseDownCapture={selectChart}>
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
      <div
        ref={chartWrapperRef}
        className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''} ${showConfig ? 'is-configuring' : ''}`}
      >
        <div
          className="chart-block-container relative overflow-hidden"
          onMouseDownCapture={selectChart}
        >
          {attrs.config.showGrid !== false && <ChartGrid />}
          {(attrs.config.title || attrs.config.subtitle) && (
            <div className="chart-block-header relative z-10">
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
              data={chartData}
              colorScheme={attrs.config.colorScheme}
              showGrid={false}
              showLegend={attrs.config.showLegend}
              columnNames={chartColumnNames}
            />
          </div>
          <div className="chart-block-footer relative z-10">
            <span className="chart-block-source">
              <span className="chart-block-source-name">{tableNode?.name || 'Unknown table'}</span>
              <span className="chart-block-source-meta">
                {isTruncated
                  ? `first ${tableData.length.toLocaleString()} of ${rowCount.toLocaleString()} rows`
                  : `${rowCount.toLocaleString()} rows`}
              </span>
              {(availableChartPoints < tableData.length || chartData.length < availableChartPoints) && (
                <span className="chart-block-source-meta">
                  {`${chartData.length.toLocaleString()} of ${availableChartPoints.toLocaleString()} points plotted`}
                </span>
              )}
            </span>
            <button onClick={openConfig} className="chart-block-configure">
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

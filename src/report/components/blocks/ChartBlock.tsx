/**
 * ChartBlock Component
 * 
 * Embeds a chart in the report with configuration options.
 * Clean, minimal design.
 */

import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useReportStore } from '../../reportStore';
import { useDataStore } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import { ChartRenderer } from '@/charts/ChartRenderer';
import { ChartConfigPanel } from '../ChartConfigPanel';
import type { ChartBlock as ChartBlockType, EnhancedChartConfig } from '../../types';
import type { TableNode, ColumnSchema } from '@/lib/types';

interface ChartBlockProps {
  block: ChartBlockType;
  reportId: string;
  isSelected: boolean;
  onOpenTable?: (tableId: string) => void;
}

export const ChartBlock = memo(function ChartBlock({ block, reportId, isSelected, onOpenTable }: ChartBlockProps) {
  const updateBlock = useReportStore((state) => state.updateBlock);
  const tableDataEntry = useDataStore((state) => state.tableData[block.sourceTableId]);
  const tableData = tableDataEntry?.rows || [];
  const tableNode = useProjectStore((state) => state.nodes[block.sourceTableId]) as TableNode | undefined;
  
  const [showConfig, setShowConfig] = useState(false);
  
  // Track if we've already auto-configured to prevent repeated updates
  const hasAutoConfigured = useRef(false);

  // Get columns from table schema
  const columns: ColumnSchema[] = useMemo(() => {
    return tableNode?.schema?.columns || [];
  }, [tableNode]);

  // Map column ID to name for display - memoized to prevent recreation
  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [columns]);

  // Memoize the chart config to prevent unnecessary re-renders
  const chartConfig = useMemo(() => ({
    xAxis: block.config.xAxis,
    yAxis: block.config.yAxis,
    series: block.config.series,
    aggregation: block.config.aggregation,
    groupBy: block.config.groupBy,
  }), [block.config.xAxis, block.config.yAxis, block.config.series, block.config.aggregation, block.config.groupBy]);

  // Memoize color scheme to prevent array recreation
  const colorScheme = useMemo(() => block.config.colorScheme, [block.config.colorScheme]);

  // Auto-select columns ONLY ONCE if not configured
  useEffect(() => {
    // Skip if already configured or if no data
    if (hasAutoConfigured.current) return;
    if (columns.length === 0 || tableData.length === 0) return;
    
    const needsUpdate = !block.config.xAxis || !block.config.yAxis;
    if (!needsUpdate) {
      hasAutoConfigured.current = true;
      return;
    }
    
    // Find a good default: first string/date column for X, first number column for Y
    const stringCol = columns.find(c => c.type === 'string' || c.type === 'date');
    const numberCol = columns.find(c => c.type === 'number');
    
    if (stringCol || numberCol) {
      const updates: Partial<EnhancedChartConfig> = {};
      if (!block.config.xAxis && stringCol) {
        updates.xAxis = stringCol.id;
      } else if (!block.config.xAxis && columns[0]) {
        updates.xAxis = columns[0].id;
      }
      if (!block.config.yAxis && numberCol) {
        updates.yAxis = numberCol.id;
      } else if (!block.config.yAxis && columns[1]) {
        updates.yAxis = columns[1].id;
      }
      
      if (Object.keys(updates).length > 0) {
        updateBlock(reportId, block.id, {
          config: { ...block.config, ...updates },
        });
      }
    }
    
    hasAutoConfigured.current = true;
  }, [columns, tableData.length, block.config.xAxis, block.config.yAxis, block.config, block.id, reportId, updateBlock]);

  const handleConfigChange = useCallback((updates: Partial<EnhancedChartConfig>) => {
    updateBlock(reportId, block.id, {
      config: { ...block.config, ...updates },
    });
  }, [reportId, block.id, block.config, updateBlock]);

  const handleChartTypeChange = useCallback((chartType: 'bar' | 'line' | 'pie' | 'scatter') => {
    updateBlock(reportId, block.id, { chartType });
  }, [reportId, block.id, updateBlock]);

  // Check if chart can be rendered
  const canRender = tableData.length > 0 && block.config.xAxis && block.config.yAxis;

  // No data state
  if (!tableData.length) {
    return (
      <div className="py-8 px-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {tableNode ? `No data in "${tableNode.name}"` : 'Table not found'}
        </p>
        {tableNode && onOpenTable && (
          <button
            onClick={() => onOpenTable(block.sourceTableId)}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Open table
          </button>
        )}
      </div>
    );
  }

  // Not configured state
  if (!canRender) {
    return (
      <div className="py-8 px-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
          Configure chart axes to display data
        </p>
        <button
          onClick={() => setShowConfig(true)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Configure Chart
        </button>
        
        {/* Config Panel */}
        {showConfig && (
          <div className="mt-4 text-left">
            <ChartConfigPanel
              config={block.config}
              chartType={block.chartType}
              columns={columns}
              onConfigChange={handleConfigChange}
              onChartTypeChange={handleChartTypeChange}
              onClose={() => setShowConfig(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Chart title and subtitle */}
      {(block.config.title || block.config.subtitle) && (
        <div className="mb-4">
          {block.config.title && (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {block.config.title}
            </h3>
          )}
          {block.config.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {block.config.subtitle}
            </p>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
        <ChartRenderer
          type={block.chartType}
          config={chartConfig}
          data={tableData}
          colorScheme={colorScheme}
          showGrid={block.config.showGrid}
          showLegend={block.config.showLegend}
          columnNames={columnNames}
        />
      </div>

      {/* Source indicator */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Source: {tableNode?.name || 'Unknown table'}
        </span>
        
        {/* Config button */}
        {isSelected && (
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure
          </button>
        )}
      </div>

      {/* Config Panel */}
      {showConfig && (
        <ChartConfigPanel
          config={block.config}
          chartType={block.chartType}
          columns={columns}
          onConfigChange={handleConfigChange}
          onChartTypeChange={handleChartTypeChange}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
});

export default ChartBlock;

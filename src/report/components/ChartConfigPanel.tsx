/**
 * ChartConfigPanel Component
 * 
 * Configuration panel for chart blocks with enhanced options:
 * - Chart type selection
 * - Data mapping (x/y axis, aggregation)
 * - Display options (title, legend, colors, grid)
 */

import { useCallback } from 'react';
import type { EnhancedChartConfig, ColorSchemeName } from '../types';
import { CHART_COLOR_SCHEMES } from '../types';
import type { ColumnSchema, AggregationType } from '@/lib/types';

interface ChartConfigPanelProps {
  config: EnhancedChartConfig;
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  columns: ColumnSchema[];
  onConfigChange: (config: Partial<EnhancedChartConfig>) => void;
  onChartTypeChange: (type: 'bar' | 'line' | 'pie' | 'scatter') => void;
  onClose: () => void;
}

export function ChartConfigPanel({
  config,
  chartType,
  columns,
  onConfigChange,
  onChartTypeChange,
  onClose,
}: ChartConfigPanelProps) {
  const numericColumns = columns.filter(c => c.type === 'number');
  const categoricalColumns = columns.filter(c => c.type === 'string' || c.type === 'date');

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ title: e.target.value });
  }, [onConfigChange]);

  const handleSubtitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ subtitle: e.target.value });
  }, [onConfigChange]);

  const handleXAxisChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({ xAxis: e.target.value });
  }, [onConfigChange]);

  const handleYAxisChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({ yAxis: e.target.value });
  }, [onConfigChange]);

  const handleAggregationChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({ aggregation: e.target.value as AggregationType });
  }, [onConfigChange]);

  const handleLegendToggle = useCallback(() => {
    onConfigChange({ showLegend: !config.showLegend });
  }, [config.showLegend, onConfigChange]);

  const handleGridToggle = useCallback(() => {
    onConfigChange({ showGrid: !config.showGrid });
  }, [config.showGrid, onConfigChange]);

  const handleLegendPositionChange = useCallback((position: 'top' | 'bottom' | 'left' | 'right') => {
    onConfigChange({ legendPosition: position });
  }, [onConfigChange]);

  const handleColorSchemeChange = useCallback((scheme: ColorSchemeName) => {
    onConfigChange({ colorScheme: CHART_COLOR_SCHEMES[scheme] as unknown as string[] });
  }, [onConfigChange]);

  const handleXAxisLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ xAxisLabel: e.target.value });
  }, [onConfigChange]);

  const handleYAxisLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ yAxisLabel: e.target.value });
  }, [onConfigChange]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Chart Configuration</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Chart Type Section */}
        <div className="pb-4 border-b border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Chart Type
          </label>
          <div className="flex gap-1">
            {[
              { type: 'bar' as const, label: 'Bar', icon: <BarIcon /> },
              { type: 'line' as const, label: 'Line', icon: <LineIcon /> },
              { type: 'pie' as const, label: 'Pie', icon: <PieIcon /> },
              { type: 'scatter' as const, label: 'Scatter', icon: <ScatterIcon /> },
            ].map((ct) => (
              <button
                key={ct.type}
                onClick={() => onChartTypeChange(ct.type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border transition-colors ${
                  chartType === ct.type
                    ? 'border-accent-green bg-accent-green/5 text-accent-green'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                {ct.icon}
                <span className="text-sm">{ct.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Labels Section */}
        <div className="pb-4 border-b border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Labels
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Title
              </label>
              <input
                type="text"
                value={config.title || ''}
                onChange={handleTitleChange}
                placeholder="Chart title"
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-accent-green"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Subtitle
              </label>
              <input
                type="text"
                value={config.subtitle || ''}
                onChange={handleSubtitleChange}
                placeholder="Optional subtitle"
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-accent-green"
              />
            </div>
          </div>
        </div>

        {/* Data Mapping Section */}
        <div className="pb-4 border-b border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Data Mapping
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Category (X-Axis)
              </label>
              <select
                value={config.xAxis || ''}
                onChange={handleXAxisChange}
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-accent-green cursor-pointer"
              >
                <option value="">Select column</option>
                {(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns).map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Value (Y-Axis)
              </label>
              <select
                value={config.yAxis || ''}
                onChange={handleYAxisChange}
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-accent-green cursor-pointer"
              >
                <option value="">Select column</option>
                {numericColumns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Aggregation
              </label>
              <select
                value={config.aggregation || 'sum'}
                onChange={handleAggregationChange}
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-accent-green cursor-pointer"
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          </div>
          
          {/* Axis Labels */}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                X-Axis Label
              </label>
              <input
                type="text"
                value={config.xAxisLabel || ''}
                onChange={handleXAxisLabelChange}
                placeholder="X-axis label"
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-accent-green"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Y-Axis Label
              </label>
              <input
                type="text"
                value={config.yAxisLabel || ''}
                onChange={handleYAxisLabelChange}
                placeholder="Y-axis label"
                className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-accent-green"
              />
            </div>
          </div>
        </div>

        {/* Display Options Section */}
        <div className="pb-4 border-b border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Display Options
          </label>
          
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showLegend !== false}
                onChange={handleLegendToggle}
                className="w-4 h-4 border-gray-300 text-accent-green focus:ring-accent-green/50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show Legend</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showGrid !== false}
                onChange={handleGridToggle}
                className="w-4 h-4 border-gray-300 text-accent-green focus:ring-accent-green/50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show Grid</span>
            </label>
          </div>

          {/* Legend Position */}
          {config.showLegend !== false && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Legend Position
              </label>
              <div className="flex gap-1">
                {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => handleLegendPositionChange(pos)}
                    className={`px-3 py-1 text-xs border transition-colors ${
                      (config.legendPosition || 'bottom') === pos
                        ? 'border-accent-green bg-accent-green/5 text-accent-green'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Color Scheme Section */}
        <div className="pb-3">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Color Scheme
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CHART_COLOR_SCHEMES) as ColorSchemeName[]).map((scheme) => (
              <button
                key={scheme}
                onClick={() => handleColorSchemeChange(scheme)}
                className={`flex items-center gap-1.5 px-2 py-1.5 border transition-colors ${
                  JSON.stringify(config.colorScheme) === JSON.stringify(CHART_COLOR_SCHEMES[scheme])
                    ? 'border-accent-green bg-accent-green/5'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
                }`}
                title={scheme}
              >
                <div className="flex -space-x-0.5">
                  {CHART_COLOR_SCHEMES[scheme].slice(0, 4).map((color, i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-full border border-white dark:border-gray-800"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300 capitalize">{scheme}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Done Button */}
        <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-accent-green hover:bg-accent-green/90 text-white text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function BarIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />
    </svg>
  );
}

function PieIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
    </svg>
  );
}

function ScatterIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="7" cy="14" r="2" />
      <circle cx="11" cy="10" r="2" />
      <circle cx="15" cy="16" r="2" />
      <circle cx="17" cy="8" r="2" />
    </svg>
  );
}

export default ChartConfigPanel;

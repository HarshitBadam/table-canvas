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
    <div className="border-t border-border bg-white dark:bg-gray-900 shadow-lg rounded-b-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chart Configuration</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Chart Type Section */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Chart Type
          </label>
          <div className="flex gap-2">
            {[
              { type: 'bar' as const, label: 'Bar', icon: <BarIcon /> },
              { type: 'line' as const, label: 'Line', icon: <LineIcon /> },
              { type: 'pie' as const, label: 'Pie', icon: <PieIcon /> },
              { type: 'scatter' as const, label: 'Scatter', icon: <ScatterIcon /> },
            ].map((ct) => (
              <button
                key={ct.type}
                onClick={() => onChartTypeChange(ct.type)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all duration-200 ${
                  chartType === ct.type
                    ? 'border-accent-green bg-accent-green/10 text-accent-green shadow-sm'
                    : 'border-transparent bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm'
                }`}
              >
                {ct.icon}
                <span className="text-sm font-medium">{ct.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Labels Section */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Labels
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={config.title || ''}
                onChange={handleTitleChange}
                placeholder="Chart title"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Subtitle
              </label>
              <input
                type="text"
                value={config.subtitle || ''}
                onChange={handleSubtitleChange}
                placeholder="Optional subtitle"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all"
              />
            </div>
          </div>
        </div>

        {/* Data Mapping Section */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Data Mapping
          </label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Category (X-Axis)
              </label>
              <select
                value={config.xAxis || ''}
                onChange={handleXAxisChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all cursor-pointer"
              >
                <option value="">Select column</option>
                {(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns).map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Value (Y-Axis)
              </label>
              <select
                value={config.yAxis || ''}
                onChange={handleYAxisChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all cursor-pointer"
              >
                <option value="">Select column</option>
                {numericColumns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Aggregation
              </label>
              <select
                value={config.aggregation || 'sum'}
                onChange={handleAggregationChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all cursor-pointer"
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
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                X-Axis Label
              </label>
              <input
                type="text"
                value={config.xAxisLabel || ''}
                onChange={handleXAxisLabelChange}
                placeholder="X-axis label"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Y-Axis Label
              </label>
              <input
                type="text"
                value={config.yAxisLabel || ''}
                onChange={handleYAxisLabelChange}
                placeholder="Y-axis label"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all"
              />
            </div>
          </div>
        </div>

        {/* Display Options Section */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Display Options
          </label>
          
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={config.showLegend !== false}
                  onChange={handleLegendToggle}
                  className="sr-only peer"
                />
                <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 peer-checked:border-accent-green peer-checked:bg-accent-green transition-all flex items-center justify-center">
                  <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">Show Legend</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={config.showGrid !== false}
                  onChange={handleGridToggle}
                  className="sr-only peer"
                />
                <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 peer-checked:border-accent-green peer-checked:bg-accent-green transition-all flex items-center justify-center">
                  <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">Show Grid</span>
            </label>
          </div>

          {/* Legend Position */}
          {config.showLegend !== false && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Legend Position
              </label>
              <div className="flex gap-2">
                {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => handleLegendPositionChange(pos)}
                    className={`px-4 py-2 text-xs font-medium rounded-lg border-2 transition-all duration-200 ${
                      (config.legendPosition || 'bottom') === pos
                        ? 'border-accent-green bg-accent-green/10 text-accent-green'
                        : 'border-transparent bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600'
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
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Color Scheme
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CHART_COLOR_SCHEMES) as ColorSchemeName[]).map((scheme) => (
              <button
                key={scheme}
                onClick={() => handleColorSchemeChange(scheme)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
                  JSON.stringify(config.colorScheme) === JSON.stringify(CHART_COLOR_SCHEMES[scheme])
                    ? 'border-accent-green bg-accent-green/10 shadow-sm'
                    : 'border-transparent bg-white dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600'
                }`}
                title={scheme}
              >
                <div className="flex -space-x-1">
                  {CHART_COLOR_SCHEMES[scheme].slice(0, 4).map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 capitalize">{scheme}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Done Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-accent-green hover:bg-accent-green/90 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
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

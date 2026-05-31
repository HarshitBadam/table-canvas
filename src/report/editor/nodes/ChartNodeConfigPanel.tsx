import type { EnhancedChartConfig } from '@/report/types';
import type { ChartType, ColumnSchema } from '@/types';
import { ChartTypeIcon } from '@/charts/ChartTypeIcon';

export interface ChartConfigPanelProps {
  config: EnhancedChartConfig;
  chartType: ChartType;
  columns: ColumnSchema[];
  onConfigChange: (updates: Partial<EnhancedChartConfig>) => void;
  onChartTypeChange: (type: ChartType) => void;
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


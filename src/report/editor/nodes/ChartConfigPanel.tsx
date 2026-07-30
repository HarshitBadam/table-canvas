import { useMemo, useState } from 'react';
import { ChartTypeIcon } from '@/charts/ChartTypeIcon';
import { useDialogFocus } from '@/components/useDialogFocus';
import type { AggregationType, ChartType, ColumnSchema } from '@/types';
import type { EnhancedChartConfig } from '../../types';
import { BlockConfigSelect, type BlockConfigOption } from './BlockConfigSelect';
import { useRevealPanel } from './useRevealPanel';

interface ChartConfigPanelProps {
  config: EnhancedChartConfig;
  chartType: ChartType;
  columns: ColumnSchema[];
  sourceName?: string;
  onConfigChange: (updates: Partial<EnhancedChartConfig>) => void;
  onChartTypeChange: (type: ChartType) => void;
  onChangeTable: () => void;
  onClose: () => void;
}

const CHART_TYPES: { type: ChartType; label: string; description: string }[] = [
  { type: 'bar', label: 'Bar', description: 'Compare categories' },
  { type: 'line', label: 'Line', description: 'Show change over time' },
  { type: 'pie', label: 'Pie', description: 'Share of a total' },
  { type: 'scatter', label: 'Scatter', description: 'Relate two numbers' },
];

const AGGREGATIONS: BlockConfigOption[] = [
  { value: 'none', label: 'Do not combine' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'count', label: 'Count rows' },
  { value: 'count_distinct', label: 'Count distinct Y values' },
];

function toOptions(columns: ColumnSchema[]): BlockConfigOption[] {
  return columns.map((column) => ({ value: column.id, label: column.name, meta: column.type }));
}

export function ChartConfigPanel({
  config,
  chartType,
  columns,
  sourceName,
  onConfigChange,
  onChartTypeChange,
  onChangeTable,
  onClose,
}: ChartConfigPanelProps) {
  const panelRef = useDialogFocus<HTMLDivElement>(true, onClose);
  useRevealPanel(panelRef);
  const [openSelect, setOpenSelect] = useState<'xAxis' | 'yAxis' | 'aggregation' | null>(null);

  const xAxisOptions = useMemo(
    () => toOptions(chartType === 'scatter' ? columns.filter((column) => column.type === 'number') : columns),
    [chartType, columns],
  );
  const yAxisOptions = useMemo(
    () => toOptions(columns.filter((column) => column.type === 'number')),
    [columns],
  );
  const columnLabel = (columnId?: string) =>
    columns.find((column) => column.id === columnId)?.name;
  const summary = config.xAxis && config.yAxis
    ? `${columnLabel(config.yAxis) ?? 'Y'} by ${columnLabel(config.xAxis) ?? 'X'}`
    : 'Choose both axes to plot this chart';

  return (
    <div
      ref={panelRef}
      className="block-config-panel"
      role="dialog"
      aria-label="Chart configuration"
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="block-config-header">
        <div className="block-config-header-text">
          <h2>Configure Chart</h2>
          <p>
            {sourceName
              ? <>Showing data from <strong>{sourceName}</strong>.</>
              : 'Choose how this chart reads your data.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="block-config-close"
          aria-label="Close chart configuration"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="block-config-body">
        <section className="block-config-section">
          <h3>Chart Type</h3>
          <div className="block-config-types">
            {CHART_TYPES.map(({ type, label, description }) => (
              <button
                key={type}
                type="button"
                onClick={() => onChartTypeChange(type)}
                aria-pressed={chartType === type}
                className={`block-config-type-card ${chartType === type ? 'active' : ''}`}
              >
                <ChartTypeIcon type={type} className="block-config-type-icon w-4 h-4" />
                <span className="block-config-type-name">{label}</span>
                <span className="block-config-type-desc">{description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="block-config-section">
          <h3>Axes</h3>
          <p className="block-config-section-help">
            {chartType === 'scatter'
              ? 'Scatter charts plot two numeric columns against each other.'
              : 'Pick the column to group by and the numeric column to measure.'}
          </p>
          <div className="block-config-fields">
            <div className="block-config-field">
              <span className="block-config-field-label">
                {chartType === 'scatter' ? 'X axis (numeric)' : 'X axis'}
              </span>
              <BlockConfigSelect
                value={config.xAxis ?? ''}
                options={xAxisOptions}
                onChange={(xAxis) => onConfigChange({ xAxis })}
                placeholder={xAxisOptions.length ? 'Select a column' : 'No eligible columns'}
                disabled={xAxisOptions.length === 0}
                ariaLabel="X axis column"
                open={openSelect === 'xAxis'}
                onOpenChange={(open) => setOpenSelect(open ? 'xAxis' : null)}
              />
            </div>
            <div className="block-config-field">
              <span className="block-config-field-label">Y axis (numeric)</span>
              <BlockConfigSelect
                value={config.yAxis ?? ''}
                options={yAxisOptions}
                onChange={(yAxis) => onConfigChange({ yAxis })}
                placeholder={yAxisOptions.length ? 'Select a column' : 'No numeric columns'}
                disabled={yAxisOptions.length === 0}
                ariaLabel="Y axis column"
                open={openSelect === 'yAxis'}
                onOpenChange={(open) => setOpenSelect(open ? 'yAxis' : null)}
              />
            </div>
          </div>
          {yAxisOptions.length === 0 && (
            <p className="block-config-note">
              This table has no numeric columns, so there is nothing to plot yet.
            </p>
          )}
        </section>

        {chartType !== 'scatter' && (
          <section className="block-config-section">
            <h3>Repeated X Values</h3>
            <p className="block-config-section-help">
              Rows that share the same X value are merged using this calculation.
            </p>
            <BlockConfigSelect
              value={config.aggregation ?? 'none'}
              options={AGGREGATIONS}
              onChange={(value) => onConfigChange({
                aggregation: value === 'none' ? undefined : (value as AggregationType),
              })}
              ariaLabel="Combine repeated X values"
              open={openSelect === 'aggregation'}
              onOpenChange={(open) => setOpenSelect(open ? 'aggregation' : null)}
            />
          </section>
        )}

        <section className="block-config-section">
          <label className="block-config-subsection-label" htmlFor="chart-config-title">
            Chart Title
          </label>
          <input
            id="chart-config-title"
            type="text"
            value={config.title || ''}
            onChange={(event) => onConfigChange({ title: event.target.value })}
            placeholder="Enter a chart title"
            className="block-config-input"
          />
          <p className="block-config-note">Shown above the chart in the report and exported PDF.</p>

          <div className="mt-4">
            <span className="block-config-subsection-label">Options</span>
            <div className="block-config-options">
              <ToggleOption
                checked={config.showLegend !== false}
                onChange={(showLegend) => onConfigChange({ showLegend })}
                label="Legend"
                description="Name each series"
              />
              <ToggleOption
                checked={config.showGrid !== false}
                onChange={(showGrid) => onConfigChange({ showGrid })}
                label="Grid"
                description="Background guide lines"
              />
            </div>
          </div>
        </section>

        <section className="block-config-section">
          <h3>Data Source</h3>
          <button type="button" onClick={onChangeTable} className="block-config-select-btn">
            <span className="block-config-select-value">{sourceName ?? 'Select a table'}</span>
            <span className="block-config-select-meta">Change</span>
            <svg className="block-config-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <p className="block-config-note">Switching tables resets the selected axes.</p>
        </section>
      </div>

      <div className="block-config-footer">
        <span className="block-config-footer-summary">{summary}</span>
        <button type="button" onClick={onClose} className="block-config-btn-done">
          Done
        </button>
      </div>
    </div>
  );
}

function ToggleOption({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`block-config-option ${checked ? 'active' : ''}`}
    >
      <span className="block-config-option-info">
        <span className="block-config-option-name">{label}</span>
        <span className="block-config-option-desc">{description}</span>
      </span>
      <span className="block-config-option-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </button>
  );
}

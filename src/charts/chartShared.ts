import type { CellValue } from '@/types'

/**
 * Value key used for count/histogram charts that have no explicit y-axis column.
 * useChartData emits the per-group count under this key and ChartRenderer reads it.
 */
export const COUNT_VALUE_KEY = '__count'

export interface ChartTypeProps {
  chartData: Record<string, CellValue>[]
  xAxisKey: string
  yAxisKey: string
  xAxisName: string
  yAxisName: string
  themeColors: (typeof CHART_THEME)['light']
  isDark: boolean
  colors: string[]
  compact: boolean
  showLegend: boolean
  shouldShowGrid: boolean
  hasTimestamps: boolean
  tooltipStyle: React.CSSProperties
  tooltipLabelStyle: React.CSSProperties
  tooltipValueStyle: React.CSSProperties
  chartHeight: number
}

export const DEFAULT_COLORS = [
  'var(--color-chart-series-1)',
  'var(--color-chart-series-2)',
  'var(--color-chart-series-3)',
  'var(--color-chart-series-4)',
  'var(--color-chart-series-5)',
]

export const CHART_THEME = {
  light: {
    gridColor: 'var(--color-chart-grid)',
    axisColor: 'var(--color-chart-axis)',
    textColor: 'var(--color-chart-text)',
    pieGridBg: 'linear-gradient(var(--color-chart-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-chart-grid) 1px, transparent 1px)',
    legendBg: 'var(--color-surface)',
    legendBorder: 'var(--color-border-subtle)',
    cellStroke: 'var(--color-surface)',
  },
  dark: {
    gridColor: 'var(--color-chart-grid)',
    axisColor: 'var(--color-chart-axis)',
    textColor: 'var(--color-chart-text)',
    pieGridBg: 'linear-gradient(var(--color-chart-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-chart-grid) 1px, transparent 1px)',
    legendBg: 'var(--color-surface)',
    legendBorder: 'var(--color-border-subtle)',
    cellStroke: 'var(--color-surface)',
  },
}

/** Epoch millisecond bounds covering 2000-01-01 to 2100-01-01. */
export const EPOCH_MS_MIN = 946684800000
export const EPOCH_MS_MAX = 4102444800000

function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'number') return false
  return value > EPOCH_MS_MIN && value < EPOCH_MS_MAX
}

function formatTimestamp(value: number): string {
  const date = new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatAxisValue(value: CellValue): string {
  if (typeof value === 'number' && isTimestamp(value)) {
    return formatTimestamp(value)
  }
  if (value === null || value === undefined) return ''
  return String(value)
}

export function detectTimestamps(
  chartData: Record<string, CellValue>[],
  xAxisKey: string,
): boolean {
  return (
    chartData.length > 0 &&
    typeof chartData[0][xAxisKey] === 'number' &&
    isTimestamp(chartData[0][xAxisKey] as number)
  )
}

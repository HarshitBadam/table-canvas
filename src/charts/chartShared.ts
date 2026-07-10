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
  '#217346',
  '#2D8B57',
  '#0EA5E9',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#6B7280',
]

export const CHART_THEME = {
  light: {
    gridColor: '#e5e5ea',
    axisColor: '#d2d2d7',
    textColor: '#6e6e73',
    pieGridBg: 'linear-gradient(#e5e5ea 1px, transparent 1px), linear-gradient(90deg, #e5e5ea 1px, transparent 1px)',
    legendBg: 'rgba(255, 255, 255, 0.95)',
    legendBorder: '#f3f4f6',
    cellStroke: 'white',
  },
  dark: {
    gridColor: '#3d3d42',
    axisColor: '#4a4a50',
    textColor: '#a1a1a6',
    pieGridBg: 'linear-gradient(#3d3d42 1px, transparent 1px), linear-gradient(90deg, #3d3d42 1px, transparent 1px)',
    legendBg: 'rgba(26, 26, 29, 0.95)',
    legendBorder: '#3d3d42',
    cellStroke: '#1a1a1d',
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

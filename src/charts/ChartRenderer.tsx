import { useMemo, memo } from 'react'
import type { ChartConfig, ChartType, CellValue } from '@/types'
import { useTheme } from '@/components/ThemeToggle'
import { DEFAULT_COLORS, CHART_THEME, detectTimestamps, COUNT_VALUE_KEY } from './chartShared'
import type { ChartTypeProps } from './chartShared'
import { BarChartRenderer } from './BarChartRenderer'
import { LineChartRenderer } from './LineChartRenderer'
import { PieChartRenderer } from './PieChartRenderer'
import { ScatterChartRenderer } from './ScatterChartRenderer'

interface ChartRendererProps {
  type: ChartType
  config: ChartConfig
  data: Record<string, CellValue>[]
  height?: number
  showLegend?: boolean
  compact?: boolean
  columnNames?: Record<string, string>
  colorScheme?: string[]
  showGrid?: boolean
  title?: string
  subtitle?: string
}

const CHART_COMPONENTS: Record<string, React.ComponentType<ChartTypeProps>> = {
  bar: BarChartRenderer,
  line: LineChartRenderer,
  pie: PieChartRenderer,
  scatter: ScatterChartRenderer,
}

export const ChartRenderer = memo(function ChartRenderer({
  type,
  config,
  data,
  height = 300,
  showLegend = true,
  compact = false,
  columnNames = {},
  colorScheme,
  showGrid = true,
  title,
  subtitle,
}: ChartRendererProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const themeColors = isDark ? CHART_THEME.dark : CHART_THEME.light
  const colors = colorScheme && colorScheme.length > 0 ? colorScheme : DEFAULT_COLORS

  // Count/histogram charts have no y-axis column; their value lives under COUNT_VALUE_KEY.
  const yAxisKey = config.yAxis || (config.aggregation === 'count' ? COUNT_VALUE_KEY : '')

  const chartData = useMemo(() => {
    if (!config.xAxis) return []

    return data.map((row, index) => ({
      ...row,
      __index: index,
      [yAxisKey]: Number(row[yAxisKey]) || 0,
    }))
  }, [data, config, yAxisKey])

  const xAxisKey = config.xAxis || ''
  const xAxisName = columnNames[xAxisKey] || xAxisKey
  const yAxisName = (config.yAxis && columnNames[yAxisKey]) || (yAxisKey === COUNT_VALUE_KEY ? 'Count' : yAxisKey)

  const headerHeight = (title ? 28 : 0) + (subtitle ? 20 : 0)
  const chartHeight = height - headerHeight

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: 'rgba(24, 24, 27, 0.95)',
    border: 'none',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '6px 10px',
    backdropFilter: 'blur(8px)',
  }

  const tooltipLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '2px',
  }

  const tooltipValueStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-tertiary"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  const hasTimestamps = detectTimestamps(chartData, xAxisKey)
  const shouldShowGrid = showGrid && !compact

  const ChartComponent = CHART_COMPONENTS[type]
  if (!ChartComponent) {
    return (
      <div
        className="flex items-center justify-center text-text-tertiary"
        style={{ height }}
      >
        Unsupported chart type
      </div>
    )
  }

  return (
    <div style={{ height }}>
      {(title || subtitle) && !compact && (
        <div className="mb-2">
          {title && (
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
      )}
      <div style={{ height: chartHeight }}>
        <ChartComponent
          chartData={chartData}
          xAxisKey={xAxisKey}
          yAxisKey={yAxisKey}
          xAxisName={xAxisName}
          yAxisName={yAxisName}
          themeColors={themeColors}
          isDark={isDark}
          colors={colors}
          compact={compact}
          showLegend={showLegend}
          shouldShowGrid={shouldShowGrid}
          hasTimestamps={hasTimestamps}
          tooltipStyle={tooltipStyle}
          tooltipLabelStyle={tooltipLabelStyle}
          tooltipValueStyle={tooltipValueStyle}
          chartHeight={chartHeight}
        />
      </div>
    </div>
  )
})

export function MiniChart({
  type,
  config,
  data,
  height = 100,
  compact = true,
  columnNames = {},
}: {
  type: ChartType
  config: ChartConfig
  data: Record<string, CellValue>[]
  height?: number
  compact?: boolean
  columnNames?: Record<string, string>
}) {
  return (
    <ChartRenderer
      type={type}
      config={config}
      data={data}
      height={height}
      showLegend={false}
      compact={compact}
      columnNames={columnNames}
    />
  )
}

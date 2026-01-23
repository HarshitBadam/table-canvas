/**
 * Chart Renderer Component
 * Renders different chart types using Recharts
 */

import { useMemo, memo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ChartConfig, CellValue } from '@/lib/types'

interface ChartRendererProps {
  type: 'bar' | 'line' | 'pie' | 'scatter'
  config: ChartConfig
  data: Record<string, CellValue>[]
  height?: number
  showLegend?: boolean
  compact?: boolean  // When true, hides axis labels and tooltips for cleaner canvas display
  columnNames?: Record<string, string>  // columnId -> displayName mapping
  colorScheme?: string[]  // Custom color palette
  showGrid?: boolean  // Show/hide grid lines (default true)
  title?: string  // Optional chart title
  subtitle?: string  // Optional chart subtitle
}

// Improved color palette - harmonious, accessible, Apple-inspired
const DEFAULT_COLORS = [
  '#217346', // Excel Green (primary)
  '#2D8B57', // Lighter green
  '#0EA5E9', // Sky blue
  '#8B5CF6', // Violet
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#6B7280', // Gray (for "Other")
]

// Check if a value looks like a timestamp
function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'number') return false
  // Epoch milliseconds range: 2000-01-01 to 2100-01-01
  const epochMsMin = 946684800000
  const epochMsMax = 4102444800000
  return value > epochMsMin && value < epochMsMax
}

// Format timestamp for display
function formatTimestamp(value: number): string {
  const date = new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Format axis value - handles timestamps and regular values
function formatAxisValue(value: CellValue): string {
  if (typeof value === 'number' && isTimestamp(value)) {
    return formatTimestamp(value)
  }
  if (value === null || value === undefined) return ''
  return String(value)
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
  // Use custom colors or default
  const COLORS = colorScheme && colorScheme.length > 0 ? colorScheme : DEFAULT_COLORS
  
  // Process data for chart
  const chartData = useMemo(() => {
    if (!config.xAxis) return []
    
    return data.map((row, index) => ({
      ...row,
      __index: index,
      // Ensure numeric values
      [config.yAxis || '']: Number(row[config.yAxis || '']) || 0,
    }))
  }, [data, config])

  // Get axis labels - use friendly names when available
  const xAxisKey = config.xAxis || ''
  const yAxisKey = config.yAxis || ''
  const xAxisName = columnNames[xAxisKey] || xAxisKey
  const yAxisName = columnNames[yAxisKey] || yAxisKey
  
  // Calculate actual height accounting for title/subtitle
  const headerHeight = (title ? 28 : 0) + (subtitle ? 20 : 0)
  const chartHeight = height - headerHeight

  // Common tooltip style
  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #d2d2d7',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
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

  // Check if X-axis data contains timestamps
  const hasTimestamps = chartData.length > 0 && 
    typeof chartData[0][xAxisKey] === 'number' && 
    isTimestamp(chartData[0][xAxisKey] as number)

  // Wrapper component for title/subtitle
  const ChartWrapper = ({ children }: { children: React.ReactNode }) => (
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
        {children}
      </div>
    </div>
  )

  // Determine if grid should be shown
  const shouldShowGrid = showGrid && !compact

  switch (type) {
    case 'bar':
      return (
        <ChartWrapper>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData} 
              margin={compact ? { top: 8, right: 8, left: 2, bottom: 2 } : { top: 20, right: 30, left: 20, bottom: 5 }}
            >
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />}
            <XAxis 
              dataKey={xAxisKey}
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              tickFormatter={hasTimestamps ? (value) => formatAxisValue(value) : undefined}
            />
            <YAxis 
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                formatter={(value: number) => [value.toLocaleString(), yAxisName]}
                labelFormatter={hasTimestamps ? (label) => formatAxisValue(label) : undefined}
              />
            )}
            {!compact && showLegend && <Legend formatter={() => yAxisName} />}
            <Bar 
              dataKey={yAxisKey}
              name={yAxisName} 
              fill={COLORS[0]}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
      )

    case 'line':
      return (
        <ChartWrapper>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={compact ? { top: 8, right: 8, left: 2, bottom: 2 } : { top: 20, right: 30, left: 20, bottom: 5 }}
            >
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />}
            <XAxis 
              dataKey={xAxisKey}
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              tickFormatter={hasTimestamps ? (value) => formatAxisValue(value) : undefined}
            />
            <YAxis 
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                formatter={(value: number) => [value.toLocaleString(), yAxisName]}
                labelFormatter={hasTimestamps ? (label) => formatAxisValue(label) : undefined}
              />
            )}
            {!compact && showLegend && <Legend formatter={() => yAxisName} />}
            <Line 
              type="monotone" 
              dataKey={yAxisKey}
              name={yAxisName}
              stroke={COLORS[0]}
              strokeWidth={compact ? 1.5 : 2}
              dot={compact ? false : { fill: COLORS[0], strokeWidth: 2 }}
              activeDot={compact ? false : { r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>
      )

    case 'pie': {
      // Process data: limit to top 6 + "Other" for cleaner display
      const processedPieData = (() => {
        if (chartData.length <= 6) return chartData
        
        const sorted = [...chartData].sort((a, b) => 
          Number(b[yAxisKey] || 0) - Number(a[yAxisKey] || 0)
        )
        const top6 = sorted.slice(0, 6)
        const otherSum = sorted.slice(6).reduce(
          (sum, row) => sum + Number(row[yAxisKey] || 0), 
          0
        )
        
        if (otherSum > 0) {
          top6.push({ [xAxisKey]: 'Other', [yAxisKey]: otherSum } as typeof chartData[0])
        }
        return top6
      })()
      
      // Calculate total for percentages
      const pieTotal = processedPieData.reduce(
        (sum, row) => sum + Number(row[yAxisKey] || 0), 
        0
      )
      
      // Build legend data
      const legendData = processedPieData.map((entry, index) => {
        const isOther = String(entry[xAxisKey]).toLowerCase() === 'other'
        const value = Number(entry[yAxisKey]) || 0
        const percent = pieTotal > 0 ? (value / pieTotal) * 100 : 0
        return {
          name: String(entry[xAxisKey]),
          value,
          percent,
          color: isOther ? '#6B7280' : COLORS[index % COLORS.length],
        }
      })
      
      return (
        <ChartWrapper>
          <div className="relative w-full h-full flex">
            {/* Grid background covering entire area */}
            {shouldShowGrid && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(#e5e5ea 1px, transparent 1px), linear-gradient(90deg, #e5e5ea 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                  opacity: 0.5,
                }}
              />
            )}
          
          {/* Chart area */}
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={compact ? { top: 5, right: 5, left: 5, bottom: 5 } : { top: 20, right: 20, left: 20, bottom: 20 }}>
                <Pie
                  data={processedPieData}
                  dataKey={yAxisKey}
                  nameKey={xAxisKey}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={compact ? chartHeight / 2.5 : "85%"}
                  paddingAngle={1}
                  label={false}
                  labelLine={false}
                  animationDuration={300}
                >
                  {processedPieData.map((entry, index) => {
                    const isOther = String(entry[xAxisKey]).toLowerCase() === 'other'
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={isOther ? '#6B7280' : COLORS[index % COLORS.length]}
                        stroke="white"
                        strokeWidth={2}
                      />
                    )
                  })}
                </Pie>
                {!compact && (
                  <Tooltip 
                    content={({ payload }) => {
                      if (!payload?.[0]) return null
                      const { name, value } = payload[0]
                      const percent = ((value as number) / pieTotal) * 100
                      return (
                        <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-border">
                          <p className="font-medium text-sm text-text-primary">{String(name)}</p>
                          <p className="text-text-secondary text-sm">
                            {Number(value).toLocaleString()} ({percent.toFixed(1)}%)
                          </p>
                        </div>
                      )
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Custom legend on the right */}
          {!compact && showLegend && (
            <div className="w-48 flex flex-col justify-center pl-4 pr-2 relative z-10">
              <div className="space-y-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-800">
                {legendData.map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-sm flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {item.value.toLocaleString()} · {item.percent.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ChartWrapper>
      )
    }

    case 'scatter':
      return (
        <ChartWrapper>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={compact ? { top: 8, right: 8, left: 2, bottom: 2 } : { top: 20, right: 30, left: 20, bottom: 5 }}>
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />}
            <XAxis 
              dataKey={xAxisKey}
              type="number"
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              name={xAxisName}
            />
            <YAxis 
              dataKey={yAxisKey}
              type="number"
              tick={compact ? false : { fontSize: 12, fill: '#6e6e73' }}
              tickLine={compact ? false : { stroke: '#d2d2d7' }}
              axisLine={{ stroke: '#d2d2d7', strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              name={yAxisName}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                formatter={(value: number) => [value.toLocaleString(), yAxisName]}
              />
            )}
            {!compact && showLegend && <Legend formatter={() => yAxisName} />}
            <Scatter 
              name={yAxisName} 
              data={chartData} 
              fill={COLORS[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartWrapper>
      )

    default:
      return (
        <div 
          className="flex items-center justify-center text-text-tertiary"
          style={{ height }}
        >
          Unsupported chart type
        </div>
      )
  }
});

/**
 * Mini chart for dashboard cards and canvas previews
 * Uses compact mode by default for cleaner display
 */
export function MiniChart({
  type,
  config,
  data,
  height = 100,
  compact = true,
  columnNames = {},
}: {
  type: 'bar' | 'line' | 'pie' | 'scatter'
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


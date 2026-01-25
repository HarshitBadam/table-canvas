/**
 * Chart Renderer Component
 * Renders different chart types using Recharts
 * Theme-aware with dark mode support
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
import { useTheme } from '@/components/ThemeToggle'

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

// Theme-aware chart styling colors
const CHART_THEME = {
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
  // Get current theme
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const themeColors = isDark ? CHART_THEME.dark : CHART_THEME.light
  
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

  // Minimal, elegant tooltip - dark style for better visibility
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: 'rgba(24, 24, 27, 0.95)',
    border: 'none',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '6px 10px',
    backdropFilter: 'blur(8px)',
  }
  
  // Custom tooltip content style - compact and readable
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
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridColor} />}
            <XAxis 
              dataKey={xAxisKey}
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              tickFormatter={hasTimestamps ? (value) => formatAxisValue(value) : undefined}
            />
            <YAxis 
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                cursor={{ fill: isDark ? 'rgba(34, 164, 93, 0.08)' : 'rgba(33, 115, 70, 0.04)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.[0]) return null
                  const value = payload[0].value as number
                  return (
                    <div style={tooltipStyle}>
                      <div style={tooltipLabelStyle}>{hasTimestamps ? formatAxisValue(label) : String(label)}</div>
                      <div style={tooltipValueStyle}>{value.toLocaleString()}</div>
                    </div>
                  )
                }}
              />
            )}
            {!compact && showLegend && (
              <Legend 
                formatter={() => yAxisName}
                wrapperStyle={{ paddingTop: '12px' }}
              />
            )}
            <Bar 
              dataKey={yAxisKey}
              name={yAxisName} 
              fill={COLORS[0]}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
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
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridColor} />}
            <XAxis 
              dataKey={xAxisKey}
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              tickFormatter={hasTimestamps ? (value) => formatAxisValue(value) : undefined}
            />
            <YAxis 
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                cursor={{ stroke: isDark ? 'rgba(34, 164, 93, 0.3)' : 'rgba(33, 115, 70, 0.2)', strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.[0]) return null
                  const value = payload[0].value as number
                  return (
                    <div style={tooltipStyle}>
                      <div style={tooltipLabelStyle}>{hasTimestamps ? formatAxisValue(label) : String(label)}</div>
                      <div style={tooltipValueStyle}>{value.toLocaleString()}</div>
                    </div>
                  )
                }}
              />
            )}
            {!compact && showLegend && (
              <Legend 
                formatter={() => yAxisName}
                wrapperStyle={{ paddingTop: '12px' }}
              />
            )}
            <Line 
              type="monotone" 
              dataKey={yAxisKey}
              name={yAxisName}
              stroke={COLORS[0]}
              strokeWidth={compact ? 1.5 : 2.5}
              dot={compact ? false : { fill: isDark ? '#1a1a1d' : '#fff', stroke: COLORS[0], strokeWidth: 2, r: 4 }}
              activeDot={compact ? false : { r: 6, fill: COLORS[0], stroke: isDark ? '#1a1a1d' : '#fff', strokeWidth: 2 }}
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
                  backgroundImage: themeColors.pieGridBg,
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
                        stroke={themeColors.cellStroke}
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
                        <div style={{
                          ...tooltipStyle,
                          minWidth: '120px',
                        }}>
                          <div style={tooltipLabelStyle}>{String(name)}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={tooltipValueStyle}>{Number(value).toLocaleString()}</span>
                            <span style={{ ...tooltipLabelStyle, marginBottom: 0 }}>({percent.toFixed(1)}%)</span>
                          </div>
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
              <div 
                className="space-y-2 backdrop-blur-sm rounded-lg p-3 shadow-sm"
                style={{
                  backgroundColor: themeColors.legendBg,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: themeColors.legendBorder,
                }}
              >
                {legendData.map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-sm flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-text-secondary">
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
              {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridColor} />}
            <XAxis 
              dataKey={xAxisKey}
              type="number"
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              height={compact ? 1 : undefined}
              name={xAxisName}
            />
            <YAxis 
              dataKey={yAxisKey}
              type="number"
              tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
              tickLine={compact ? false : { stroke: themeColors.axisColor }}
              axisLine={{ stroke: themeColors.axisColor, strokeWidth: compact ? 1 : 1 }}
              width={compact ? 1 : undefined}
              name={yAxisName}
              tickFormatter={(value) => value.toLocaleString()}
            />
            {!compact && (
              <Tooltip 
                contentStyle={tooltipStyle}
                cursor={{ strokeDasharray: '3 3', stroke: isDark ? 'rgba(34, 164, 93, 0.35)' : 'rgba(33, 115, 70, 0.25)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]?.payload) return null
                  const data = payload[0].payload as Record<string, unknown>
                  return (
                    <div style={tooltipStyle}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div>
                          <div style={tooltipLabelStyle}>{xAxisName}</div>
                          <div style={tooltipValueStyle}>{Number(data[xAxisKey]).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={tooltipLabelStyle}>{yAxisName}</div>
                          <div style={tooltipValueStyle}>{Number(data[yAxisKey]).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
            )}
            {!compact && showLegend && (
              <Legend 
                formatter={() => yAxisName}
                wrapperStyle={{ paddingTop: '12px' }}
              />
            )}
            <Scatter 
              name={yAxisName} 
              data={chartData} 
              fill={COLORS[0]}
              cursor="pointer"
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


import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ChartTypeProps } from './chartShared'

export function PieChartRenderer({
  chartData,
  xAxisKey,
  yAxisKey,
  themeColors,
  colors,
  compact,
  showLegend,
  shouldShowGrid,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipValueStyle,
  chartHeight,
}: ChartTypeProps) {
  // Limit to top 6 + "Other" for cleaner display
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

  const pieTotal = processedPieData.reduce(
    (sum, row) => sum + Number(row[yAxisKey] || 0),
    0
  )

  const legendData = processedPieData.map((entry, index) => {
    const isOther = String(entry[xAxisKey]).toLowerCase() === 'other'
    const value = Number(entry[yAxisKey]) || 0
    const percent = pieTotal > 0 ? (value / pieTotal) * 100 : 0
    return {
      name: String(entry[xAxisKey]),
      value,
      percent,
      color: isOther ? '#6B7280' : colors[index % colors.length],
    }
  })

  return (
    <div className="relative w-full h-full flex">
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
                    fill={isOther ? '#6B7280' : colors[index % colors.length]}
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
                    <div style={{ ...tooltipStyle, minWidth: '120px' }}>
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
  )
}

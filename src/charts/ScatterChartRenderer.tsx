import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartTypeProps } from './chartShared'

export function ScatterChartRenderer({
  chartData,
  xAxisKey,
  yAxisKey,
  xAxisName,
  yAxisName,
  themeColors,
  isDark,
  colors,
  compact,
  showLegend,
  shouldShowGrid,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipValueStyle,
}: ChartTypeProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={compact ? { top: 8, right: 8, left: 2, bottom: 2 } : { top: 20, right: 30, left: 20, bottom: 5 }}>
        {shouldShowGrid && <CartesianGrid strokeDasharray="3 3" stroke={themeColors.gridColor} />}
        <XAxis
          dataKey={xAxisKey}
          type="number"
          tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
          tickLine={compact ? false : { stroke: themeColors.axisColor }}
          axisLine={{ stroke: themeColors.axisColor, strokeWidth: 1 }}
          height={compact ? 1 : undefined}
          name={xAxisName}
        />
        <YAxis
          dataKey={yAxisKey}
          type="number"
          tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
          tickLine={compact ? false : { stroke: themeColors.axisColor }}
          axisLine={{ stroke: themeColors.axisColor, strokeWidth: 1 }}
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
          fill={colors[0]}
          cursor="pointer"
        />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

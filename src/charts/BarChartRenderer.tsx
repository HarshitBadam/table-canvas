import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartTypeProps } from './chartShared'
import { formatAxisValue } from './chartShared'

export function BarChartRenderer({
  chartData,
  xAxisKey,
  yAxisKey,
  yAxisName,
  themeColors,
  isDark,
  colors,
  compact,
  showLegend,
  shouldShowGrid,
  hasTimestamps,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipValueStyle,
}: ChartTypeProps) {
  return (
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
          axisLine={{ stroke: themeColors.axisColor, strokeWidth: 1 }}
          height={compact ? 1 : undefined}
          tickFormatter={hasTimestamps ? (value) => formatAxisValue(value) : undefined}
        />
        <YAxis
          tick={compact ? false : { fontSize: 12, fill: themeColors.textColor }}
          tickLine={compact ? false : { stroke: themeColors.axisColor }}
          axisLine={{ stroke: themeColors.axisColor, strokeWidth: 1 }}
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
          fill={colors[0]}
          radius={[4, 4, 0, 0]}
          cursor="pointer"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

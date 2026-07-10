import { escapeHtml } from './reportHtmlUtils'

interface ChartEntry {
  tableName: string
  headers: string[]
  columnNames?: Record<string, string>
  rows: Record<string, unknown>[]
}

interface ChartPoint {
  label: string
  x: number
  y: number
}

const COLORS = ['#217346', '#2563eb', '#7c3aed', '#0891b2', '#b45309', '#be123c']

function toFiniteNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function buildPoints(
  rows: Record<string, unknown>[],
  xAxis: string,
  yAxis: string,
  aggregation?: string,
): ChartPoint[] {
  if (!aggregation) {
    return rows.flatMap((row, index) => {
      const y = toFiniteNumber(row[yAxis])
      if (y === undefined) return []
      return [{
        label: String(row[xAxis] ?? ''),
        x: toFiniteNumber(row[xAxis]) ?? index,
        y,
      }]
    })
  }

  const groups = new Map<string, { label: string; values: number[]; rows: number }>()
  for (const row of rows) {
    const label = String(row[xAxis] ?? '')
    const group = groups.get(label) ?? { label, values: [], rows: 0 }
    group.rows += 1
    const value = toFiniteNumber(row[yAxis])
    if (value !== undefined) group.values.push(value)
    groups.set(label, group)
  }

  return [...groups.values()].map((group, index) => {
    let y = 0
    if (aggregation === 'count') y = group.rows
    else if (aggregation === 'count_distinct') y = new Set(group.values).size
    else if (aggregation === 'avg') {
      y = group.values.length
        ? group.values.reduce((sum, value) => sum + value, 0) / group.values.length
        : 0
    } else if (aggregation === 'min') y = group.values.length ? Math.min(...group.values) : 0
    else if (aggregation === 'max') y = group.values.length ? Math.max(...group.values) : 0
    else y = group.values.reduce((sum, value) => sum + value, 0)
    return { label: group.label, x: index, y }
  })
}

function piePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const startX = cx + radius * Math.cos(start)
  const startY = cy + radius * Math.sin(start)
  const endX = cx + radius * Math.cos(end)
  const endY = cy + radius * Math.sin(end)
  const largeArc = end - start > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`
}

function renderPie(points: ChartPoint[]): string {
  const positive = points.filter((point) => point.y > 0)
  const total = positive.reduce((sum, point) => sum + point.y, 0)
  if (total <= 0) return ''
  let angle = -Math.PI / 2
  const slices = positive.map((point, index) => {
    const next = angle + point.y / total * Math.PI * 2
    const path = `<path d="${piePath(210, 145, 110, angle, next)}" fill="${COLORS[index % COLORS.length]}"><title>${escapeHtml(point.label)}: ${point.y}</title></path>`
    angle = next
    return path
  }).join('')
  const legend = positive.slice(0, 10).map((point, index) =>
    `<span class="chart-legend-item"><i style="background:${COLORS[index % COLORS.length]}"></i>${escapeHtml(point.label)} (${point.y})</span>`
  ).join('')
  return `<svg viewBox="0 0 640 290" role="img">${slices}</svg><div class="chart-legend">${legend}</div>`
}

function renderCartesian(points: ChartPoint[], type: string): string {
  if (points.length === 0) return ''
  const width = 640
  const height = 320
  const left = 58
  const right = 18
  const top = 18
  const bottom = 58
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const minY = Math.min(0, ...points.map((point) => point.y))
  const maxY = Math.max(0, ...points.map((point) => point.y))
  const yRange = maxY - minY || 1
  const yFor = (value: number) => top + (maxY - value) / yRange * plotHeight
  const xValues = type === 'scatter' ? points.map((point) => point.x) : points.map((_, index) => index)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const xRange = maxX - minX || 1
  const xFor = (value: number) => left + (value - minX) / xRange * plotWidth
  const baseline = yFor(0)
  const grid = [0, 1, 2, 3, 4].map((index) => {
    const y = top + index / 4 * plotHeight
    const value = maxY - index / 4 * yRange
    return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(value.toFixed(1))}</text>`
  }).join('')
  let marks = ''

  if (type === 'bar') {
    const gap = Math.max(2, plotWidth / Math.max(points.length, 1) * 0.18)
    const barWidth = Math.max(2, plotWidth / Math.max(points.length, 1) - gap)
    marks = points.map((point, index) => {
      const x = left + index / points.length * plotWidth + gap / 2
      const y = yFor(Math.max(point.y, 0))
      const barHeight = Math.max(1, Math.abs(baseline - yFor(point.y)))
      return `<rect x="${x}" y="${point.y >= 0 ? y : baseline}" width="${barWidth}" height="${barHeight}" fill="${COLORS[0]}"><title>${escapeHtml(point.label)}: ${point.y}</title></rect>`
    }).join('')
  } else {
    const coordinates = points.map((point, index) => ({
      point,
      x: xFor(type === 'scatter' ? point.x : index),
      y: yFor(point.y),
    }))
    if (type === 'line') {
      marks += `<polyline fill="none" stroke="${COLORS[0]}" stroke-width="2.5" points="${coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}"/>`
    }
    marks += coordinates.map(({ point, x, y }) =>
      `<circle cx="${x}" cy="${y}" r="4" fill="${COLORS[0]}"><title>${escapeHtml(point.label)}: ${point.y}</title></circle>`
    ).join('')
  }

  const labels = points.length <= 20
    ? points.map((point, index) => {
        const x = type === 'scatter' ? xFor(point.x) : xFor(index)
        return `<text x="${x}" y="${height - 34}" text-anchor="middle">${escapeHtml(point.label.slice(0, 12))}</text>`
      }).join('')
    : ''

  return `<svg viewBox="0 0 ${width} ${height}" role="img">
    <g class="chart-grid">${grid}</g>
    <line x1="${left}" x2="${width - right}" y1="${baseline}" y2="${baseline}" stroke="#6b7280"/>
    ${marks}${labels}
  </svg>`
}

export function renderReportChart(
  attrs: Record<string, unknown>,
  entry: ChartEntry,
): string {
  const config = (attrs.config ?? {}) as Record<string, unknown>
  const chartType = String(attrs.chartType || 'bar')
  const xAxis = String(config.xAxis || '')
  const yAxis = String(config.yAxis || '')
  const title = String(config.title || `${entry.tableName} chart`)
  if (!xAxis || !yAxis) {
    return '<div class="block-placeholder">[Chart — select X and Y axes to render]</div>\n'
  }

  const points = buildPoints(
    entry.rows,
    xAxis,
    yAxis,
    config.aggregation ? String(config.aggregation) : undefined,
  ).slice(0, 500)
  const graphic = chartType === 'pie'
    ? renderPie(points)
    : renderCartesian(points, chartType)
  if (!graphic) {
    return `<div class="block-placeholder">[Chart: ${escapeHtml(title)} — no numeric data]</div>\n`
  }

  const xLabel = String(config.xAxisLabel || entry.columnNames?.[xAxis] || xAxis)
  const yLabel = String(config.yAxisLabel || entry.columnNames?.[yAxis] || yAxis)
  return `<figure class="report-chart" aria-label="${escapeHtml(title)}">
    <h3>${escapeHtml(title)}</h3>
    ${config.subtitle ? `<p class="chart-subtitle">${escapeHtml(String(config.subtitle))}</p>` : ''}
    ${graphic}
    <figcaption>X: ${escapeHtml(xLabel)} · Y: ${escapeHtml(yLabel)} · Source: ${escapeHtml(entry.tableName)} · ${entry.rows.length.toLocaleString()} sampled rows</figcaption>
  </figure>\n`
}

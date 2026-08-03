import type { Content } from 'pdfmake/interfaces'
import {
  buildReportChartVector,
  type ReportChartLegendItem,
} from '@/persistence/reportHtmlChart'
import type { EmbeddedDataMap } from '@/persistence/reportHtmlGenerator'
import { boxed, placeholder } from './boxes'
import { MUTED, RULE } from './theme'

/** Fits inside the chart frame's border and padding on a portrait page. */
const CHART_WIDTH = 470

/**
 * pdfmake renders SVG without a CSS engine, so labels need presentation
 * attributes. `<title>` exists only for HTML tooltips.
 */
function toPdfSvg(svg: string): string {
  return svg
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<text /g, `<text fill="${MUTED}" font-size="10" `)
}

/** Colour-coded text — a PDF legend cannot lean on CSS swatches. */
function legendRuns(legend: ReportChartLegendItem[]): Content[] {
  const runs: Content[] = []
  legend.forEach((item, index) => {
    if (index > 0) runs.push({ text: ' · ', color: MUTED })
    runs.push({ text: `${item.label} (${item.value})`, color: item.color })
  })
  return runs
}

export function chartBlocks(
  attrs: Record<string, unknown>,
  dataMap: EmbeddedDataMap,
): Content[] {
  const entry = dataMap[String(attrs.sourceTableId ?? '')]
  const chart = entry ? buildReportChartVector(attrs, entry) : null
  if (!chart) {
    const chartType = String(attrs.chartType || 'chart')
    return [placeholder(`[Chart: ${chartType} — no data available]`)]
  }

  const inner: Content[] = [{ text: chart.title, style: 'chartTitle' }]
  if (chart.subtitle) inner.push({ text: chart.subtitle, style: 'chartSubtitle' })
  inner.push({ svg: toPdfSvg(chart.svg), width: CHART_WIDTH })
  if (chart.legend.length > 0) {
    inner.push({ text: legendRuns(chart.legend), style: 'chartCaption' })
  }
  inner.push({ text: chart.caption, style: 'chartCaption' })

  return [boxed(inner, { border: RULE })]
}

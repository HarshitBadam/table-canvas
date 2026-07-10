export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value, 'https://tablecanvas.local')
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : null
  } catch {
    return null
  }
}

export function renderInlineTable(attrs: Record<string, unknown>): string {
  const headers = Array.isArray(attrs.headers)
    ? attrs.headers.map(value => String(value ?? ''))
    : []
  const rows = Array.isArray(attrs.rows)
    ? attrs.rows.filter(Array.isArray).slice(0, 1_000) as unknown[][]
    : []
  if (headers.length === 0) {
    return '<div class="block-placeholder">[Empty table]</div>\n'
  }
  const caption = typeof attrs.caption === 'string' ? attrs.caption : ''
  let html = '<table>\n'
  if (caption) html += `<caption>${escapeHtml(caption)}</caption>\n`
  html += `<thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>\n<tbody>`
  for (const row of rows) {
    html += `<tr>${headers.map((_, index) => `<td>${escapeHtml(String(row[index] ?? ''))}</td>`).join('')}</tr>\n`
  }
  html += '</tbody></table>\n'
  if (Array.isArray(attrs.rows) && attrs.rows.length > rows.length) {
    html += `<p class="table-note">Showing the first ${rows.length.toLocaleString()} rows.</p>\n`
  }
  return html
}

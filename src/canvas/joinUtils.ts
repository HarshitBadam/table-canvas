import type { ColumnSchema, CellValue } from '@/types'

/**
 * Computes match statistics between two data sets joined on specified key columns.
 * Returns the number of matching rows and the match rate as a percentage.
 */
export function analyzeMatch(
  leftData: Record<string, CellValue>[],
  rightData: Record<string, CellValue>[],
  leftKey: string,
  rightKey: string
) {
  if (!leftKey || !rightKey || !leftData.length || !rightData.length) {
    return { rows: 0, rate: 0 }
  }
  const leftVals = leftData.map(r => r[leftKey]).filter(v => v != null)
  const rightSet = new Set(rightData.map(r => r[rightKey]).filter(v => v != null).map(String))
  const matches = leftVals.filter(v => rightSet.has(String(v))).length
  return {
    rows: matches || leftData.length,
    rate: leftVals.length ? Math.round((matches / leftVals.length) * 100) : 0
  }
}

/**
 * Heuristically finds the best matching key pair between two column sets by combining
 * name similarity (30%) and value overlap match rate (70%).
 * Returns null if no candidate scores above the minimum threshold.
 */
export function findBestKeys(
  leftCols: ColumnSchema[],
  rightCols: ColumnSchema[],
  leftData: Record<string, CellValue>[],
  rightData: Record<string, CellValue>[]
) {
  let best: { left: string; right: string; score: number } | null = null
  for (const lc of leftCols) {
    for (const rc of rightCols) {
      const ln = lc.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const rn = rc.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const nameScore = ln === rn ? 100 : ln.includes(rn) || rn.includes(ln) ? 50 : 0
      const { rate } = analyzeMatch(leftData, rightData, lc.id, rc.id)
      const score = nameScore * 0.3 + rate * 0.7
      if (!best || score > best.score) best = { left: lc.id, right: rc.id, score }
    }
  }
  return best && best.score > 15 ? best : null
}

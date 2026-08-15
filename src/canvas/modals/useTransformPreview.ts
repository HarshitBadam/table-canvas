import { useEffect, useMemo, useRef, useState } from 'react'
import type { TableRow } from '@/state/dataStore'
import { getTableData } from '@/engine/materialization/tableDataService'
import { analyzeMatch, findBestKeys } from '@/canvas/joinUtils'
import type { ColumnSchema } from '@/types'

// Cap preview size so key-selection match checks stay responsive; findBestKeys
// compares every left/right pair against this sample. Full join/append still
// runs over complete tables at creation time.
const MATCH_PREVIEW_SAMPLE_LIMIT = 1_000

interface UseTransformPreviewParams {
  isOpen: boolean
  sourceNodeId: string
  targetNodeId: string
  leftCols: ColumnSchema[]
  rightCols: ColumnSchema[]
}

/**
 * Owns the join-preview lifecycle for `TransformModal`: loads a bounded sample
 * from both tables, auto-selects the best-looking key pair until the user
 * overrides it, and reports sample-based match quality for that key pair.
 */
export function useTransformPreview({
  isOpen,
  sourceNodeId,
  targetNodeId,
  leftCols,
  rightCols,
}: UseTransformPreviewParams) {
  const [leftKey, setLeftKeyState] = useState('')
  const [rightKey, setRightKeyState] = useState('')
  const [leftData, setLeftData] = useState<TableRow[]>([])
  const [rightData, setRightData] = useState<TableRow[]>([])
  const [leftTotalRows, setLeftTotalRows] = useState(0)
  const [rightTotalRows, setRightTotalRows] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string>()
  const [previewRequestKey, setPreviewRequestKey] = useState(0)
  // Tracks whether the user picked a key manually, so a later data/column
  // refresh doesn't clobber their choice with a fresh best-key guess.
  const keysTouchedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    keysTouchedRef.current = false
  }, [isOpen, sourceNodeId, targetNodeId])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(undefined)
    void Promise.all([
      getTableData(sourceNodeId, 0, MATCH_PREVIEW_SAMPLE_LIMIT),
      getTableData(targetNodeId, 0, MATCH_PREVIEW_SAMPLE_LIMIT),
    ]).then(([left, right]) => {
      if (cancelled) return
      setLeftData(left.rows)
      setRightData(right.rows)
      setLeftTotalRows(left.totalRows)
      setRightTotalRows(right.totalRows)
      setPreviewError(left.error || right.error)
    }).catch((error) => {
      if (!cancelled) {
        setPreviewError(error instanceof Error ? error.message : 'Unable to preview join data')
      }
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, sourceNodeId, targetNodeId, previewRequestKey])

  useEffect(() => {
    if (keysTouchedRef.current) return
    if (leftCols.length && rightCols.length) {
      const best = findBestKeys(leftCols, rightCols, leftData, rightData)
      if (best) {
        setLeftKeyState(best.left)
        setRightKeyState(best.right)
      } else {
        setLeftKeyState(leftCols[0].id)
        setRightKeyState(rightCols[0].id)
      }
    }
  }, [leftCols, rightCols, leftData, rightData])

  const match = useMemo(
    () => analyzeMatch(leftData, rightData, leftKey, rightKey),
    [leftData, rightData, leftKey, rightKey],
  )
  const isExactMatch = leftTotalRows <= MATCH_PREVIEW_SAMPLE_LIMIT && rightTotalRows <= MATCH_PREVIEW_SAMPLE_LIMIT

  const setLeftKey = (value: string) => {
    keysTouchedRef.current = true
    setLeftKeyState(value)
  }
  const setRightKey = (value: string) => {
    keysTouchedRef.current = true
    setRightKeyState(value)
  }
  const retryPreview = () => setPreviewRequestKey((key) => key + 1)

  return {
    leftKey,
    rightKey,
    setLeftKey,
    setRightKey,
    leftTotalRows,
    rightTotalRows,
    previewLoading,
    previewError,
    retryPreview,
    match,
    isExactMatch,
  }
}

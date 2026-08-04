import { useEffect, useRef } from 'react'

/** Pointer distance from a scrollable edge that starts auto-scroll. */
const EDGE_ZONE = 56
/** Max pixels scrolled per animation frame at the edge. */
const MAX_STEP = 26

interface DragAutoScrollOptions {
  containerRef: { current: HTMLElement | null }
  isActiveRef: { current: boolean }
  headerHeight: number
  rowHeaderWidth: number
  onReachCell: (rowIndex: number, colIndex: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Scroll delta for one axis: 0 inside the safe band, then linear up to MAX_STEP
 * through EDGE_ZONE, and MAX_STEP once the pointer is past the edge.
 */
function axisStep(position: number, min: number, max: number) {
  if (position < min + EDGE_ZONE) {
    return -Math.round(MAX_STEP * clamp((min + EDGE_ZONE - position) / EDGE_ZONE, 0, 1))
  }
  if (position > max - EDGE_ZONE) {
    return Math.round(MAX_STEP * clamp((position - (max - EDGE_ZONE)) / EDGE_ZONE, 0, 1))
  }
  return 0
}

/** Resolve the gridcell under a point, skipping sticky header/row-number chrome. */
function cellAtPoint(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    const cell = element.closest('[role="gridcell"]')
    if (cell) return cell
  }
  return null
}

/**
 * Range selection relies on cell `mouseenter`, which cannot reach rows that are
 * not mounted. While a drag is active, scroll toward the pointer and extend the
 * selection to the cell under it so ranges can grow past the virtualized window.
 */
export function useDragAutoScroll({
  containerRef,
  isActiveRef,
  headerHeight,
  rowHeaderWidth,
  onReachCell,
}: DragAutoScrollOptions) {
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastCellRef = useRef<string | null>(null)
  const onReachCellRef = useRef(onReachCell)
  onReachCellRef.current = onReachCell

  useEffect(() => {
    const stop = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      pointerRef.current = null
      lastCellRef.current = null
    }

    const extendTo = (x: number, y: number) => {
      const cell = cellAtPoint(x, y)
      if (!cell) return
      // aria-row/colindex are 1-based and include sticky header/index chrome.
      const rowIndex = Number(cell.getAttribute('aria-rowindex')) - 2
      const colIndex = Number(cell.getAttribute('aria-colindex')) - 2
      if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) return
      const key = `${rowIndex}:${colIndex}`
      if (key === lastCellRef.current) return
      lastCellRef.current = key
      onReachCellRef.current(rowIndex, colIndex)
    }

    const step = () => {
      frameRef.current = null
      const container = containerRef.current
      const pointer = pointerRef.current
      if (!isActiveRef.current || !container || !pointer) return

      const rect = container.getBoundingClientRect()
      const left = rect.left + rowHeaderWidth
      const top = rect.top + headerHeight
      const stepX = axisStep(pointer.x, left, rect.right)
      const stepY = axisStep(pointer.y, top, rect.bottom)
      // Inside the safe band, native cell mouseenter owns range updates.
      if (stepX === 0 && stepY === 0) return

      container.scrollBy(stepX, stepY)
      extendTo(clamp(pointer.x, left + 1, rect.right - 1), clamp(pointer.y, top + 1, rect.bottom - 1))
      frameRef.current = requestAnimationFrame(step)
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isActiveRef.current) {
        if (pointerRef.current) stop()
        return
      }
      pointerRef.current = { x: event.clientX, y: event.clientY }
      lastCellRef.current = null
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(step)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      stop()
    }
  }, [containerRef, headerHeight, isActiveRef, rowHeaderWidth])
}

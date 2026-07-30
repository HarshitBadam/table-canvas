import { useEffect, useRef } from 'react'

/** How close to an edge the pointer has to get before the grid starts moving. */
const EDGE_ZONE = 56
/** Scroll distance per frame once the pointer is right on the edge. */
const MAX_STEP = 26

interface DragAutoScrollOptions {
  /** The scrolling element that holds the grid. */
  containerRef: { current: HTMLElement | null }
  /** True for as long as a range drag is in progress. */
  isActiveRef: { current: boolean }
  /** Height of the sticky header row, which cells never sit under. */
  headerHeight: number
  /** Width of the sticky row-number column, likewise. */
  rowHeaderWidth: number
  /** Called with the cell the (clamped) pointer resolves to. */
  onReachCell: (rowIndex: number, colIndex: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Distance to scroll along one axis: zero while the pointer sits comfortably
 * inside the viewport, ramping up to MAX_STEP as it reaches the edge and
 * staying there once it goes past.
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

/** The topmost grid cell at a viewport point, looking past the sticky chrome. */
function cellAtPoint(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    const cell = element.closest('[role="gridcell"]')
    if (cell) return cell
  }
  return null
}

/**
 * Range selection is driven by `mouseenter` on cells, so on its own it stops at
 * whatever is currently on screen: rows below the fold are not even mounted.
 * While a drag is running this walks the viewport towards the pointer and keeps
 * extending the range to the cell under it, so a selection can reach past the
 * visible window in any direction.
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
      // Back inside the safe area: plain cell hovering takes over again.
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

import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH } from './constants'

export function useColumnResize() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)

  const getColumnWidth = useCallback((columnId: string) => {
    return columnWidths[columnId] || DEFAULT_COLUMN_WIDTH
  }, [columnWidths])

  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnId)
    setResizeStartX(e.clientX)
    setResizeStartWidth(getColumnWidth(columnId))
  }, [getColumnWidth])

  const resizeColumnBy = useCallback((columnId: string, delta: number) => {
    setColumnWidths(prev => {
      const currentWidth = prev[columnId] || DEFAULT_COLUMN_WIDTH
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, currentWidth + delta))
      return { ...prev, [columnId]: nextWidth }
    })
  }, [])

  const setColumnWidth = useCallback((columnId: string, width: number) => {
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width))
    setColumnWidths(prev => ({ ...prev, [columnId]: nextWidth }))
  }, [])

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, resizeStartWidth + delta))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  return { getColumnWidth, handleResizeStart, resizeColumnBy, setColumnWidth, resizingColumn }
}

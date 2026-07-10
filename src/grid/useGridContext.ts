import { useContext } from 'react'
import { gridContext } from './gridContextStore'

export function useGridContext() {
  const context = useContext(gridContext)
  if (!context) throw new Error('useGridContext must be used within GridProvider')
  return context
}

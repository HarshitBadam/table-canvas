import { useCallback } from 'react'
import { useNavigation } from '@/layout/NavigationContext'
import type { CommandExecutionOptions } from './commands/types'

export function useSuggestionNavigation(
  beforeNavigate?: () => void,
): CommandExecutionOptions['navigateToNode'] {
  const { openTable, openChart } = useNavigation()

  return useCallback((nodeId: string, kind: 'table' | 'chart') => {
    beforeNavigate?.()
    if (kind === 'chart') {
      openChart(nodeId)
    } else {
      openTable(nodeId)
    }
  }, [beforeNavigate, openChart, openTable])
}

import { useContext } from 'react'
import { navigationContext, type NavigationContextValue } from './navigationContextStore'

export type { NavigationContextValue } from './navigationContextStore'

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(navigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}

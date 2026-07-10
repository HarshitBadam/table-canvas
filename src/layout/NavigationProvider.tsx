import type { ReactNode } from 'react'
import { navigationContext, type NavigationContextValue } from './navigationContextStore'

interface NavigationProviderProps {
  children: ReactNode
  value: NavigationContextValue
}

export function NavigationProvider({ children, value }: NavigationProviderProps) {
  return <navigationContext.Provider value={value}>{children}</navigationContext.Provider>
}

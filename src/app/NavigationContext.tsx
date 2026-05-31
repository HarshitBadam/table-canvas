import { createContext, useContext, type ReactNode } from 'react'

export interface NavigationContextValue {
  openTable: (tableId: string) => void
  openChart: (chartId: string) => void
  openCanvas: () => void
  openDashboard: () => void
  openReport: () => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({
  children,
  value,
}: {
  children: ReactNode
  value: NavigationContextValue
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}

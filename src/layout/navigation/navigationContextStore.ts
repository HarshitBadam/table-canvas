import { createContext } from 'react'

export interface NavigationContextValue {
  openTable: (tableId: string) => void
  openChart: (chartId: string) => void
  openCanvas: () => void
  openDashboard: () => void
  openReport: () => void
}

export const navigationContext = createContext<NavigationContextValue | null>(null)

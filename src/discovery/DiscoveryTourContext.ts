import { createContext, useContext } from 'react'
import type { DiscoveryTourId } from './discoveryTourPersistence'

export interface DiscoveryTourContextValue {
  replayAllTours: () => void
  activeTourId: DiscoveryTourId | null
}

const defaultValue: DiscoveryTourContextValue = {
  replayAllTours: () => undefined,
  activeTourId: null,
}

export const DiscoveryTourContext = createContext<DiscoveryTourContextValue>(defaultValue)

export function useDiscoveryTours(): DiscoveryTourContextValue {
  return useContext(DiscoveryTourContext)
}

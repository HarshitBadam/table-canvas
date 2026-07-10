import { createContext } from 'react'
import type { GridContextValue } from './GridContext'

export const gridContext = createContext<GridContextValue | null>(null)

import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const themeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useTheme(): ThemeContextValue {
  return (
    useContext(themeContext) ?? {
      theme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
    }
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { enableMapSet } from 'immer'
import './styles/index.css'
import App from './layout/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeToggle'
import { AppProvider } from './state/AppContext'

// Enable Immer's MapSet plugin for Set/Map support in stores
enableMapSet()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

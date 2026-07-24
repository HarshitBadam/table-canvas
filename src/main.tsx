import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { enableMapSet } from 'immer'
import './styles/index.css'
import App from './layout/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeProvider'
import { AppProvider } from './state/AppContext'
import { initializeFrontendTelemetry } from './observability/frontendTelemetry'
import { ExclusiveTabGate } from './components/ExclusiveTabGate'

enableMapSet()
initializeFrontendTelemetry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ExclusiveTabGate>
          <AppProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </AppProvider>
        </ExclusiveTabGate>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

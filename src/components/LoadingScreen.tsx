/**
 * Loading Screen Component
 * Shows a clean loading state with phase indicator during app initialization
 */

import type { AppPhase } from '@/state/appContext'

interface LoadingScreenProps {
  phase: AppPhase
  message: string
}

const PHASE_ORDER: AppPhase[] = [
  'initializing_engine',
  'checking_auth',
  'loading_project',
  'materializing',
]

export function LoadingScreen({ phase, message }: LoadingScreenProps) {
  const currentIndex = PHASE_ORDER.indexOf(phase)
  const progress = currentIndex >= 0 ? ((currentIndex + 1) / PHASE_ORDER.length) * 100 : 0

  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="text-center w-full max-w-sm px-4">
        {/* Logo */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-accent-green/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-accent-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-text-primary mb-2">
          Table Canvas
        </h1>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-border rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-accent-green transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 10)}%` }}
          />
        </div>

        {/* Status Message */}
        <p className="text-sm text-text-secondary animate-pulse">
          {message}
        </p>

        {/* Phase Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {PHASE_ORDER.map((p, i) => (
            <div
              key={p}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                i <= currentIndex 
                  ? 'bg-accent-green' 
                  : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

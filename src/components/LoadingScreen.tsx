import type { AppPhase } from '@/state/AppContext'
import { BrandMark } from './BrandMark'

interface LoadingScreenProps {
  phase: AppPhase
  message: string
}

const PHASE_ORDER: AppPhase[] = [
  'initializing_engine',
  'checking_auth',
  'loading_project',
]

export function LoadingScreen({ phase, message }: LoadingScreenProps) {
  const currentIndex = PHASE_ORDER.indexOf(phase)
  const progress = currentIndex >= 0 ? ((currentIndex + 1) / PHASE_ORDER.length) * 100 : 0

  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="text-center w-full max-w-sm px-4">
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-accent-green flex items-center justify-center"
          style={{
            boxShadow: '0 6px 16px -4px rgba(0, 0, 0, 0.22), 0 3px 8px -2px rgb(var(--color-accent-rgb) / 0.25)',
          }}
        >
          <BrandMark className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-xl font-semibold text-text-primary mb-2">
          Table Canvas
        </h1>

        <div className="w-full h-1 bg-border rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-accent-green transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 10)}%` }}
          />
        </div>

        <p className="text-sm text-text-secondary animate-pulse">
          {message}
        </p>

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

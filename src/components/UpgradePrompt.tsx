import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { LimitExceeded } from '@/shared/enforce'
import { useApp } from '@/state/AppContext'

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  violation: LimitExceeded | null
}

export function UpgradePrompt({ open, onOpenChange, violation }: UpgradePromptProps) {
  const [signInError, setSignInError] = useState<string | null>(null)
  const { leaveGuest } = useApp()
  if (!violation) return null

  const isGuest = violation.tier === 'guest'

  const handleSignIn = async () => {
    setSignInError(null)
    try {
      await leaveGuest()
      onOpenChange(false)
      window.location.assign('/login')
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Could not prepare sign-in')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl focus:outline-none motion-safe:animate-scale-in">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                isGuest ? 'bg-accent-green/10 text-accent-text' : 'bg-warning/10 text-warning-text'
              }`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isGuest ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7m-8 0h8m-8 0a2 2 0 00-2 2v9h12V9a2 2 0 00-2-2m-4 4v4m-2-2h4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4m0 4h.01M10.3 3.8 2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z" />
                  )}
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-base font-semibold text-text-primary">
                  {isGuest ? 'Sign in to continue' : 'Free plan limit reached'}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-text-secondary mt-1">
                  {violation.reason}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="m6 6 8 8m0-8-8 8" strokeLinecap="round" strokeWidth={1.75} />
                </svg>
              </Dialog.Close>
            </div>
          </div>

          <div className="px-5 pb-5">
            {isGuest ? (
              <ul className="space-y-2 text-sm text-text-secondary" aria-label="Sign in benefits">
                {['Create more tables and projects', 'Sync your work across devices', 'Keep working without starting over'].map(benefit => (
                  <li key={benefit} className="flex items-center gap-2">
                    <svg className="h-4 w-4 shrink-0 text-accent-green" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                      <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} />
                    </svg>
                    {benefit}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                You can continue by removing work you no longer need. Expanded plans are not available yet.
              </p>
            )}
            {signInError && (
              <p className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-error-text" role="alert">
                {signInError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-secondary/40 px-5 py-3">
            <Dialog.Close asChild>
              <button className="btn btn-ghost">
                {isGuest ? 'Not now' : 'Close'}
              </button>
            </Dialog.Close>

            {isGuest && (
              <button
                onClick={() => void handleSignIn()}
                className="btn btn-primary gap-2 px-4"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

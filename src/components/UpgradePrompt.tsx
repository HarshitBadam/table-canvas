import * as Dialog from '@radix-ui/react-dialog'
import type { LimitExceeded } from '@/shared/enforce'

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  violation: LimitExceeded | null
}

export function UpgradePrompt({ open, onOpenChange, violation }: UpgradePromptProps) {
  if (!violation) return null

  const isGuest = violation.tier === 'guest'

  const handleGoogleSignIn = () => {
    const g = (window as unknown as Record<string, unknown>).google as
      | { accounts?: { id?: { prompt: () => void } } }
      | undefined
    if (g?.accounts?.id) {
      g.accounts.id.prompt()
    }
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-2xl w-full max-w-sm z-50 overflow-hidden border border-border-elevation focus:outline-none">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text-primary">
                  {isGuest ? 'Upgrade to continue' : 'Limit reached'}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-text-secondary mt-1">
                  {violation.reason}
                </Dialog.Description>
              </div>
            </div>
          </div>

          <div className="px-5 pb-4">
            {isGuest ? (
              <div className="bg-surface-secondary rounded-lg p-3 text-sm text-text-secondary">
                Sign in with Google to unlock higher limits, cloud sync, and more storage.
              </div>
            ) : (
              <div className="bg-surface-secondary rounded-lg p-3 text-sm text-text-secondary">
                You've reached the free plan limit. We're working on expanded plans — stay tuned!
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2 bg-surface-secondary/50">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors">
                {isGuest ? 'Maybe later' : 'OK'}
              </button>
            </Dialog.Close>

            {isGuest && (
              <button
                onClick={handleGoogleSignIn}
                className="px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green/90 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

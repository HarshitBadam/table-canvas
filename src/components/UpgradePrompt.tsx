import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { LimitExceeded } from '@/shared/enforce'
import { useApp } from '@/state/AppContext'

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  violation: LimitExceeded | null
  /** Places this prompt above another open dialog, such as sheet selection. */
  layer?: 'base' | 'nested'
}

export function UpgradePrompt({
  open,
  onOpenChange,
  violation,
  layer = 'base',
}: UpgradePromptProps) {
  const [signInError, setSignInError] = useState<string | null>(null)
  const { leaveGuest } = useApp()
  if (!violation) return null

  const isGuest = violation.tier === 'guest'
  const reason = violation.reason.toLowerCase()
  const isHardFileLimit = !isGuest && reason.includes('file size')
  const limitContext = reason.includes('row')
    ? 'You’ve reached this project’s row limit.'
    : reason.includes('project')
      ? 'You’ve reached your project limit.'
      : reason.includes('table')
        ? 'You’ve reached this project’s table limit.'
        : 'You’ve reached this workspace limit.'
  const overlayLayer = layer === 'nested' ? 'z-[90]' : 'z-modal-backdrop'
  const contentLayer = layer === 'nested' ? 'z-[100]' : 'z-modal'
  const overlayStyle = layer === 'nested'
    ? 'bg-black/15 backdrop-blur-[1px]'
    : 'bg-black/50 backdrop-blur-sm'

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSignInError(null)
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 ${overlayLayer} ${overlayStyle} motion-safe:animate-fade-in`}
        />
        <Dialog.Content
          className={`fixed inset-0 ${contentLayer} m-auto h-fit w-[min(29rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border-elevation bg-surface shadow-[0_24px_64px_rgb(0_0_0_/_0.24)] focus:outline-none motion-safe:animate-scale-in`}
        >
          <div className={`px-5 pt-5 ${isHardFileLimit ? 'pb-2' : 'pb-4'}`}>
            <Dialog.Title className="text-base font-semibold leading-5 text-text-primary">
              {isGuest
                ? 'Sign in to keep working'
                : isHardFileLimit
                  ? 'File is too large'
                  : 'Free plan limit reached'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-[13px] font-[450] leading-[18px] text-text-secondary">
              <span className="block">
                {isGuest ? `${limitContext} Sign in to continue.` : violation.reason}
              </span>
              {isHardFileLimit && (
                <span className="block">
                  Choose a file no larger than 20 MB and try again.
                </span>
              )}
            </Dialog.Description>
          </div>

          {!isHardFileLimit && <div className="px-5 py-3.5">
            {isGuest ? (
              <ul className="space-y-2.5" aria-label="Sign in benefits">
                {['Create more tables and projects', 'Sync your work across devices', 'Keep working without starting over'].map(benefit => (
                  <li key={benefit} className="flex items-center gap-2.5 text-[13px] font-[450] leading-[18px] text-text-secondary">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                        <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                      </svg>
                    </span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                You can continue by removing work you no longer need. Expanded plans are not available yet.
              </p>
            )}
            {signInError && (
              <p className="mt-4 rounded-xl border border-error/20 bg-error-soft px-3 py-2.5 text-sm text-error-text" role="alert">
                {signInError}
              </p>
            )}
          </div>}

          <div className="flex items-center justify-end gap-2 px-5 py-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className={`btn rounded-lg px-3 py-1.5 ${isHardFileLimit ? 'btn-primary' : 'btn-ghost'}`}
              >
                {isGuest ? 'Maybe later' : 'Close'}
              </button>
            </Dialog.Close>

            {isGuest && (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="btn btn-primary rounded-md px-3 py-1.5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30 focus-visible:ring-offset-2"
              >
                Sign in to continue
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

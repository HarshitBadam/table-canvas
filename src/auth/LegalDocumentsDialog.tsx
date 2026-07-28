import * as Dialog from '@radix-ui/react-dialog'
import { PrivacyContent, TermsContent } from './legal-content'

type LegalDocument = 'terms' | 'privacy'

interface LegalDocumentsDialogProps {
  document: LegalDocument | null
  onOpenChange: (open: boolean) => void
}

export function LegalDocumentsDialog({
  document,
  onOpenChange,
}: LegalDocumentsDialogProps) {
  const isTerms = document === 'terms'
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy'

  return (
    <Dialog.Root open={document !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-modal m-auto flex h-fit max-h-[min(40rem,calc(100dvh-3rem))] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl focus:outline-none motion-safe:animate-scale-in">
          <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 pb-4 pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold leading-tight text-text-primary">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-tertiary">
                Last updated July 28, 2026
              </Dialog.Description>
            </div>
          </header>

          <div
            className="legal-scroll min-h-0 px-6 py-5 text-sm leading-6 text-text-secondary"
          >
            <div className="legal-prose">
              {isTerms ? <TermsContent /> : <PrivacyContent />}
            </div>
          </div>

          <footer className="flex justify-end border-t border-border-subtle px-6 py-4">
            <Dialog.Close asChild>
              <button type="button" className="auth-action h-9 w-full px-4 sm:w-auto">
                Close
              </button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


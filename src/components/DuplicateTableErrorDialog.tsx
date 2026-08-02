import * as Dialog from '@radix-ui/react-dialog'

export function DuplicateTableErrorDialog({
  error,
  onClose,
}: {
  error: string | null
  onClose: () => void
}) {
  return (
    <Dialog.Root open={error !== null} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/50 motion-safe:animate-fade-in" />
        <Dialog.Content
          role="alertdialog"
          className="fixed inset-0 z-modal m-auto h-fit w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-border-elevation bg-surface p-5 shadow-xl focus:outline-none motion-safe:animate-scale-in"
        >
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Couldn&apos;t duplicate table
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-5 text-text-secondary">
            {error}
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-primary">OK</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

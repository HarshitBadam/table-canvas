import * as Dialog from '@radix-ui/react-dialog'

interface DeleteReportDialogProps {
  open: boolean
  reportName: string
  onOpenChange: (open: boolean) => void
  onDelete: () => void
}

export function DeleteReportDialog({
  open,
  reportName,
  onOpenChange,
  onDelete,
}: DeleteReportDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Delete “{reportName}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            This permanently removes the report from this project. Project tables, charts, and source data are not affected.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-ghost">Cancel</button>
            </Dialog.Close>
            <button type="button" onClick={onDelete} className="btn btn-danger">
              Delete report
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

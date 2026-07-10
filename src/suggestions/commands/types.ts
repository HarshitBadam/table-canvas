export interface SuggestionCommand {
  execute(): Promise<CommandResult>
  getDescription(): string
}

export interface CommandResult {
  success: boolean
  message: string
  createdNodeId?: string
  createdNodeName?: string
  error?: string
}

type ToastType = 'success' | 'error' | 'info'

export interface ToastNotification {
  type: ToastType
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

let toastHandler: ((toast: ToastNotification) => void) | null = null

export function setToastHandler(handler: (toast: ToastNotification) => void): void {
  toastHandler = handler
}

export function showToast(toast: ToastNotification): void {
  if (toastHandler) {
    toastHandler(toast)
  }
}

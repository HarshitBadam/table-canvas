import { useEffect } from 'react'
import type { ToastNotification } from './commands'

export function Toast({ notification, onDismiss }: { 
  notification: ToastNotification
  onDismiss: () => void 
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const bgColor = notification.type === 'success' ? 'bg-green-600' :
                  notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-3 animate-slide-up`}>
      <span className="text-sm">{notification.message}</span>
      {notification.action && (
        <button
          onClick={() => {
            notification.action?.onClick()
            onDismiss()
          }}
          className="text-sm font-medium underline hover:no-underline"
        >
          {notification.action.label}
        </button>
      )}
      <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

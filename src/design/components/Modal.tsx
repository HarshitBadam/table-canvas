/**
 * Modal Component
 * 
 * Atomic modal wrapper using Radix Dialog.
 */

import { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export interface ModalContentProps {
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  className?: string;
  showClose?: boolean;
}

const sizeStyles = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[960px]',
};

export function Modal({ open, onOpenChange, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

export function ModalTrigger({ children, asChild = true }: { children: ReactNode; asChild?: boolean }) {
  return <Dialog.Trigger asChild={asChild}>{children}</Dialog.Trigger>;
}

export function ModalContent({
  title,
  description,
  size = 'md',
  children,
  className,
  showClose = true,
}: ModalContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-modal-backdrop animate-fade-in" />
      <Dialog.Content
        className={clsx(
          'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100%-32px)]',
          'bg-surface rounded-2xl shadow-xl border border-border',
          'z-modal animate-scale-in',
          'focus:outline-none',
          'max-h-[calc(100vh-64px)] overflow-hidden flex flex-col',
          sizeStyles[size],
          className
        )}
      >
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
            <div>
              {title && (
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  {title}
                </Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-1 text-sm text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {showClose && (
              <Dialog.Close asChild>
                <button
                  className="flex-shrink-0 p-2 -m-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-end gap-3 p-6 pt-4 border-t border-border bg-surface-secondary/50',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ModalClose({ children, asChild = true }: { children: ReactNode; asChild?: boolean }) {
  return <Dialog.Close asChild={asChild}>{children}</Dialog.Close>;
}

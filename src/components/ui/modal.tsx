'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  maxWidth?: number
}

/**
 * The system's dialog frame: Pine-tinted backdrop, a Surface card with a serif
 * Display title and an X, the body supplied by the caller. For a yes/no
 * decision reach for `ConfirmDialog`, which builds its action row on this.
 */
export function Modal({ open, onClose, title, children, className, maxWidth = 520 }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-forest-deep/40 [animation:fade-in_200ms_ease]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-[201] w-[90vw] -translate-x-1/2 -translate-y-1/2',
            'max-h-[90vh] overflow-y-auto overscroll-contain outline-none',
            'rounded-card border border-line bg-surface shadow-frame',
            '[animation:scale-in_200ms_cubic-bezier(0.16,1,0.3,1)]',
            className
          )}
          // The one genuinely per-instance dimension.
          style={{ maxWidth }}
        >
          <div className="flex items-center justify-between border-b border-line px-7 pb-4 pt-5">
            {title && (
              <Dialog.Title className="font-display text-display font-normal text-ink">
                {title}
              </Dialog.Title>
            )}
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="ml-auto grid size-7 place-items-center rounded-sm text-text3 transition-colors duration-150 ease-contour hover:bg-ink/[0.04] hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <div className="px-7 pb-7 pt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

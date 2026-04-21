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

export function Modal({ open, onClose, title, children, className, maxWidth = 520 }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,25,24,0.45)',
            zIndex: 200,
            animation: 'fade-in 200ms ease',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn('overflow-y-auto', className)}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            width: '90vw',
            maxWidth,
            maxHeight: '90vh',
            border: '0.5px solid var(--color-border-1)',
            zIndex: 201,
            animation: 'scale-in 200ms cubic-bezier(0.16,1,0.3,1)',
            outline: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 28px 16px',
              borderBottom: '0.5px solid var(--color-border-1)',
            }}
          >
            {title && (
              <Dialog.Title
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  fontWeight: 400,
                  color: 'var(--color-text-1)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {title}
              </Dialog.Title>
            )}
            <Dialog.Close asChild style={{ marginLeft: 'auto' }}>
              <button
                aria-label="Close"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-3)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-overlay)'
                  e.currentTarget.style.color = 'var(--color-text-1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-3)'
                }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div style={{ padding: '20px 28px 28px' }}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

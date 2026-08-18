'use client'

import { Modal } from './modal'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The body copy — say what will be lost or changed, concretely. */
  children: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** 'danger' for destructive outcomes (Clay); 'primary' for consequential but safe ones. */
  tone?: 'danger' | 'primary'
  loading?: boolean
  /** Holds the confirm button shut until the body's own gate is satisfied — a typed-back name,
   *  a ticked box. The dialog does not know the gate; it only refuses to act before it opens. */
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * The system's yes/no decision: body copy plus a ghost cancel and one acting
 * button. Replaces per-feature confirm markup and every window.confirm — the
 * action names what it does ("Discard and leave"), never "OK".
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  disabled,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={440}>
      <div className="flex flex-col gap-6">
        <div className="text-body leading-relaxed text-text2">{children}</div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

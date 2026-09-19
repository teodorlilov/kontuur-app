'use client'

import { useState } from 'react'
import { ConfirmDialog } from './confirm-dialog'
import { Input } from './input'
import { normalizeForCompare } from '@/utils/format'

interface TypedConfirmDialogProps {
  open: boolean
  title: string
  /** The body copy — what will be lost, concretely. The typed-name field renders after it. */
  children: React.ReactNode
  confirmLabel: string
  /** The *stored* name the person must type back — never an unsaved draft of it. */
  name: string
  loading?: boolean
  /** Receives what was typed, so the caller can hand it to an action that re-checks it. */
  onConfirm: (typed: string) => void
  onClose: () => void
}

/**
 * A `ConfirmDialog` held shut until the person types the thing's name back — for the two
 * deletions that take everything with them (a client, a workspace). The gate exists to make the
 * reader stop and look at WHICH one this is, not to test their typing, so the match ignores case
 * and spacing (`normalizeForCompare`, the same rule the server applies).
 *
 * What was typed survives an action that fails or throws and is cleared only on close, so a
 * refusal leaves the person where they were; the field and the confirm button are disabled while
 * the action runs, so it cannot be submitted twice.
 */
export function TypedConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  name,
  loading,
  onConfirm,
  onClose,
}: TypedConfirmDialogProps) {
  const [typedName, setTypedName] = useState('')
  const matches = normalizeForCompare(typedName) === normalizeForCompare(name)

  function handleClose() {
    setTypedName('')
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel={confirmLabel}
      loading={loading}
      disabled={!matches}
      onConfirm={() => onConfirm(typedName)}
      onClose={handleClose}
    >
      {children}

      <label className="mt-5 block">
        <span className="mb-1.5 block text-caption text-text3">
          Type <strong className="font-semibold text-ink">{name}</strong> to confirm
        </span>
        <Input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          autoComplete="off"
          disabled={loading}
        />
      </label>
    </ConfirmDialog>
  )
}

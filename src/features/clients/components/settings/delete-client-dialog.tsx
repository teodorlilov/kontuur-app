'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { deleteClient } from '@/features/clients/actions/client-actions'
import {
  buildDeletionSummary,
  type ClientDeletionCounts,
} from '@/features/clients/lib/deletion-summary'

interface DeleteClientDialogProps {
  open: boolean
  onClose: () => void
  clientId: string
  /** The *stored* name, never the unsaved draft — see the typed-name check below. */
  clientName: string
  counts: ClientDeletionCounts
}

/**
 * The confirm step for deleting a client, gated on typing the client's name.
 *
 * Typed confirmation rather than a plain button because this is the most destructive action in
 * the product — ~18 tables and two storage buckets — and it sits one tab away from the page
 * people open to edit a niche.
 *
 * If a third confirm-act-toast-navigate flow appears, extract a `useConfirmedAction` hook; at
 * two (this and team-tab) the abstraction would have one shape and no evidence.
 */
export function DeleteClientDialog({
  open,
  onClose,
  clientId,
  clientName,
  counts,
}: DeleteClientDialogProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [typedName, setTypedName] = useState('')

  // Case- and whitespace-insensitive: the gate is there to make the reader stop and look at
  // which client this is, not to test their typing.
  const nameMatches = typedName.trim().toLowerCase() === clientName.trim().toLowerCase()

  async function handleConfirm() {
    setIsDeleting(true)
    try {
      const result = await deleteClient(clientId)
      if (!result.ok) {
        toast.error(result.error)
        setIsDeleting(false)
        return
      }
      toast.success(`${clientName} deleted`)
      // isDeleting deliberately stays true through the navigation: the button keeps its
      // loading state instead of flicking back to enabled on a page that is going away,
      // and it cannot be pressed a second time in between.
      router.push('/clients')
      router.refresh()
    } catch (err) {
      // A server action can reject outright — without this the spinner never clears and the
      // dialog looks permanently busy.
      console.error(`[clients:delete] action threw for ${clientId}:`, err)
      toast.error('Could not delete the client. Please try again.')
      setIsDeleting(false)
    }
  }

  function handleClose() {
    setTypedName('')
    onClose()
  }

  const summary = buildDeletionSummary(counts)

  return (
    <ConfirmDialog
      open={open}
      title="Delete this client"
      confirmLabel="Delete permanently"
      loading={isDeleting}
      disabled={!nameMatches}
      onConfirm={handleConfirm}
      onClose={handleClose}
    >
      <p>
        <strong className="font-semibold text-ink">{clientName}</strong> and everything belonging to
        it will be permanently deleted
        {summary.length > 0 ? ':' : '.'}
      </p>

      {summary.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="mt-3">
        Every draft, image and generated visual goes too, including the files in storage. This
        cannot be undone.
      </p>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-caption text-text3">
          Type <strong className="font-semibold text-ink">{clientName}</strong> to confirm
        </span>
        <Input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          autoComplete="off"
          disabled={isDeleting}
        />
      </label>
    </ConfirmDialog>
  )
}

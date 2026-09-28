'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TypedConfirmDialog } from '@/components/ui/typed-confirm-dialog'
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
  /** The *stored* name, never the unsaved draft — it is what the person types back. */
  clientName: string
  counts: ClientDeletionCounts
  /** What the delete does to the bill, or null when there is nothing to say (`deleteClientNotice`). */
  notice: string | null
}

/**
 * The confirm step for deleting a client: what goes and, on a paid plan, what it does to the bill
 * (`notice`), then the typed-name gate (`TypedConfirmDialog`, shared with the workspace delete).
 * Typed, not a plain button: the delete takes ~18 tables and two storage buckets, and its button
 * sits in the Basic info rail, beside where people edit a niche. The act-then-go step stays here, not in a shared hook, because
 * each deletion flow ends somewhere different. On success `isDeleting` stays true through the
 * navigation, so the button cannot be pressed twice.
 */
export function DeleteClientDialog({
  open,
  onClose,
  clientId,
  clientName,
  counts,
  notice,
}: DeleteClientDialogProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

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
      router.push('/clients')
      router.refresh()
    } catch (err) {
      console.error(`[clients:delete] action threw for ${clientId}:`, err)
      toast.error('Could not delete the client. Please try again.')
      setIsDeleting(false)
    }
  }

  const summary = buildDeletionSummary(counts)

  return (
    <TypedConfirmDialog
      open={open}
      title="Delete this client"
      confirmLabel="Delete permanently"
      name={clientName}
      loading={isDeleting}
      onConfirm={handleConfirm}
      onClose={onClose}
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
        Every draft, image and generated visual goes too, including the files in storage — along
        with the Instagram history synced for this client and any saved reports. Instagram cannot
        return past days once an account is disconnected. This cannot be undone.
      </p>

      {notice && <p className="mt-3">{notice}</p>}
    </TypedConfirmDialog>
  )
}

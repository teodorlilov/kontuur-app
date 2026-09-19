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
}

/**
 * The confirm step for deleting a client: what goes, then the typed-name gate
 * (`TypedConfirmDialog`, shared with the workspace delete), then the action and the way out.
 *
 * Typed confirmation rather than a plain button because this is one of the two actions in the
 * product that take everything with them — ~18 tables and two storage buckets — and it sits one
 * tab away from the page people open to edit a niche.
 *
 * What is this dialog's own, and stays here: the copy, the call, and the exit. The three
 * deletion flows (a teammate, a client, a workspace) end in different places — a refresh, the
 * roster, leaving the app — so the act-then-go step is written where each is read, not hidden in
 * a hook that would make the differences look accidental. On success `isDeleting` stays true
 * through the navigation, so the button keeps its loading state on a page that is going away and
 * cannot be pressed twice; a server action that rejects outright is caught, or the spinner would
 * never clear and the dialog would look permanently busy.
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
    </TypedConfirmDialog>
  )
}

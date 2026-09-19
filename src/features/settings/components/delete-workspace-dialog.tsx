'use client'

import { useState } from 'react'
import { TypedConfirmDialog } from '@/components/ui/typed-confirm-dialog'
import { toast } from '@/components/ui/toast'
import { deleteWorkspace } from '@/features/settings/actions/workspace-actions'
import { GOODBYE_PATH } from '@/utils/constants'
import { pluralise } from '@/utils/format'

interface DeleteWorkspaceDialogProps {
  open: boolean
  onClose: () => void
  /** The stored workspace name — what the person types back. */
  agencyName: string
  clientCount: number
  memberCount: number
  agencyMode: 'agency' | 'solo'
  /** The "your plan ends on …" line while a cancelled plan still runs, from copy.ts; null otherwise. */
  notice: string | null
}

/**
 * The confirm step for deleting the whole workspace: what goes, what the law keeps, the typed
 * name (`TypedConfirmDialog`), then the action and the way out.
 *
 * On success the page is left with a full navigation to `GOODBYE_PATH` — the only navigation
 * this flow makes. The action itself writes no cookie and revalidates no path, precisely so the
 * router stays put until this line runs (workspace-actions.ts); the session ends on the goodbye
 * page. `isDeleting` stays true through the navigation so the button cannot be pressed twice on
 * a page that is going away.
 */
export function DeleteWorkspaceDialog({
  open,
  onClose,
  agencyName,
  clientCount,
  memberCount,
  agencyMode,
  notice,
}: DeleteWorkspaceDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleConfirm(typed: string) {
    setIsDeleting(true)
    try {
      const result = await deleteWorkspace(typed)
      if (!result.ok) {
        toast.error(result.error)
        setIsDeleting(false)
        return
      }
      window.location.assign(GOODBYE_PATH)
    } catch (err) {
      console.error('[workspace:delete] action threw:', err)
      toast.error('Could not delete the workspace. Please try again.')
      setIsDeleting(false)
    }
  }

  const lost =
    agencyMode === 'solo'
      ? ['your business', 'your account']
      : [pluralise(clientCount, 'client'), `${pluralise(memberCount, 'member')} and their accounts`]

  return (
    <TypedConfirmDialog
      open={open}
      title="Delete this workspace"
      confirmLabel="Delete permanently"
      name={agencyName}
      loading={isDeleting}
      onConfirm={handleConfirm}
      onClose={onClose}
    >
      <p>
        <strong className="font-semibold text-ink">{agencyName}</strong> and everything in it will
        be permanently deleted:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {lost.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>every post, image, connected account and report</li>
      </ul>
      <p className="mt-3">
        Invoices already issued are kept for ten years as the law requires — each was emailed to you
        when it was paid. This cannot be undone.
      </p>
      {notice && <p className="mt-3">{notice}</p>}
    </TypedConfirmDialog>
  )
}

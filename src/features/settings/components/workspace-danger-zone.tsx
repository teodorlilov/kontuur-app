'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RailText } from '@/components/ui/form'
import { openBillingPortal } from '@/features/settings/actions/billing-actions'
import { DeleteWorkspaceDialog } from './delete-workspace-dialog'
import { useFollowUrl } from './use-follow-url'

interface WorkspaceDangerZoneProps {
  agencyName: string
  clientCount: number
  memberCount: number
  agencyMode: 'agency' | 'solo'
  /** Why deletion is refused right now (`deleteWorkspaceRefusal`), or null when it is allowed. */
  refusal: string | null
  /** The "your plan ends on …" line for the dialog (`deleteWorkspaceNotice`), or null. */
  notice: string | null
}

/**
 * The contents of the Account rail's danger box, in its two states: the sentence and an enabled
 * "Delete workspace" that opens the confirm dialog, or — while a subscription is open — the
 * refusal and a "Manage billing" that hands off to Stripe's portal, where the plan is ended. The
 * rail opens, the dialog decides: the same split as `ClientDangerRail` + `DeleteClientDialog`.
 */
export function WorkspaceDangerZone({
  agencyName,
  clientCount,
  memberCount,
  agencyMode,
  refusal,
  notice,
}: WorkspaceDangerZoneProps) {
  const [open, setOpen] = useState(false)
  const { busy, follow } = useFollowUrl()

  if (refusal) {
    return (
      <>
        <RailText>{refusal}</RailText>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          loading={busy}
          onClick={() => void follow(openBillingPortal)}
        >
          Manage billing
        </Button>
      </>
    )
  }

  return (
    <>
      <RailText>
        {agencyMode === 'solo'
          ? 'Deleting the workspace removes your business, every post, image and connected account, and your own account.'
          : "Deleting the workspace removes every client, post, image and connected account, and every member's account."}
      </RailText>
      <Button variant="danger" size="sm" className="mt-3 w-full" onClick={() => setOpen(true)}>
        Delete workspace
      </Button>
      <DeleteWorkspaceDialog
        open={open}
        onClose={() => setOpen(false)}
        agencyName={agencyName}
        clientCount={clientCount}
        memberCount={memberCount}
        agencyMode={agencyMode}
        notice={notice}
      />
    </>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RailText } from '@/components/ui/form'
import { DeleteWorkspaceDialog } from './delete-workspace-dialog'

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
 * refusal alone, which names the plan panel's own "Cancel plan" as the way through; the guard
 * is `canDelete` on the entitlement and the delete action's own check, never this box. The rail
 * opens, the dialog decides: the same split as `ClientDangerRail` + `DeleteClientDialog`.
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

  if (refusal) return <RailText>{refusal}</RailText>

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

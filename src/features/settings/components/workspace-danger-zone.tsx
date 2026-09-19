'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RailText } from '@/components/ui/form'
import { DeleteWorkspaceDialog } from './delete-workspace-dialog'
import { PlanEndControl } from './plan-end-control'

interface WorkspaceDangerZoneProps {
  agencyName: string
  clientCount: number
  memberCount: number
  agencyMode: 'agency' | 'solo'
  /** Why deletion is refused right now (`deleteWorkspaceRefusal`), or null when it is allowed. */
  refusal: string | null
  /** What cancelling the plan means (`cancelPlanConsequence`), for the refusal's Cancel plan. */
  cancelConsequence: string
  /** The "your plan ends on …" line for the dialog (`deleteWorkspaceNotice`), or null. */
  notice: string | null
}

/**
 * The contents of the Account rail's danger box, in its two states: the sentence and an enabled
 * "Delete workspace" that opens the confirm dialog, or — while a subscription is open — the
 * refusal and the plan's own "Cancel plan" (`PlanEndControl`), after which the page refreshes
 * into the first state. The rail opens, the dialog decides: the same split as `ClientDangerRail`
 * + `DeleteClientDialog`.
 */
export function WorkspaceDangerZone({
  agencyName,
  clientCount,
  memberCount,
  agencyMode,
  refusal,
  cancelConsequence,
  notice,
}: WorkspaceDangerZoneProps) {
  const [open, setOpen] = useState(false)

  if (refusal) {
    return (
      <>
        <RailText>{refusal}</RailText>
        <PlanEndControl ending={false} consequence={cancelConsequence} className="mt-3 w-full" />
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

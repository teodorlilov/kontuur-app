'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormSection, RailBox, RailText } from '@/components/ui/form'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { removeTeamMember } from '@/features/settings/actions/team-actions'
import { InviteForm } from './invite-form'
import { MemberRow } from './member-row'
import type { TeamMember } from '@/types/api'

interface TeamTabProps {
  members: TeamMember[]
  currentUserId: string
  currentUserRole: string
  agencyMode: 'agency' | 'solo'
}

/**
 * Who has access to the workspace.
 *
 * Members only — there is no invitations table, so a pending-invite count could report nothing
 * but a fixed zero.
 */
export function TeamTab({ members, currentUserId, currentUserRole, agencyMode }: TeamTabProps) {
  const router = useRouter()
  const isAdmin = currentUserRole === 'admin'
  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState(false)

  async function handleConfirmRemove() {
    if (!pendingRemoval) return
    setRemoving(true)
    const result = await removeTeamMember(pendingRemoval.id)
    if (result.ok) {
      toast.success(`${pendingRemoval.email} removed from the workspace`)
      setPendingRemoval(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
    setRemoving(false)
  }

  if (agencyMode === 'solo') {
    return <p className="py-6 text-body text-text2">Team management is available in agency mode.</p>
  }

  return (
    <>
      {isAdmin && <InviteForm />}

      <FormSection
        legend="Team members"
        description={`${members.length} member${members.length === 1 ? '' : 's'}`}
      >
        <div className="col-span-12">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.id === currentUserId}
              canRemove={isAdmin}
              onRemove={setPendingRemoval}
            />
          ))}
        </div>
      </FormSection>

      <ConfirmDialog
        open={!!pendingRemoval}
        title="Remove team member"
        confirmLabel="Remove permanently"
        loading={removing}
        onConfirm={handleConfirmRemove}
        onClose={() => setPendingRemoval(null)}
      >
        <b className="font-semibold text-ink">{pendingRemoval?.email}</b> will lose access to this
        workspace and their account will be deleted. This cannot be undone.
      </ConfirmDialog>
    </>
  )
}

/** Context rail for the Team panel. */
export function TeamRail() {
  return (
    <RailBox title="Roles">
      <RailText>
        <b className="font-semibold text-ink">Admin</b> — full access, including workspace settings
        and the team.
      </RailText>
      <RailText>
        <b className="font-semibold text-ink">Member</b> — clients, drafts and review only.
      </RailText>
    </RailBox>
  )
}

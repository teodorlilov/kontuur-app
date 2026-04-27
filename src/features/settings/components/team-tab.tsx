'use client'

import { SectionCard } from '@/components/ui/section-card'
import { InviteForm } from './invite-form'
import { MemberRow } from './member-row'
import { toast } from '@/components/ui/toast'
import type { TeamMember } from '@/types/api'

interface TeamTabProps {
  workspaceName: string
  members: TeamMember[]
  currentUserId: string
  currentUserRole: string
  agencyMode: 'agency' | 'solo'
}

/** Team tab: invite form, member list, pending invites. */
export function TeamTab({
  workspaceName,
  members,
  currentUserId,
  currentUserRole,
  agencyMode,
}: TeamTabProps) {
  const isAdmin = currentUserRole === 'admin'

  if (agencyMode === 'solo') {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          Team management is available in agency mode.
        </p>
      </div>
    )
  }

  function handleRemoveMember(memberId: string) {
    toast.error('Removing members is not yet available')
    void memberId
  }

  return (
    <>
      <PageHeader title="Team" subtitle={`Manage who has access to the ${workspaceName} workspace`} />

      {isAdmin && (
        <SectionCard
          title="Invite a team member"
          subtitle="They'll receive an email with a link to join your workspace"
        >
          <InviteForm />
        </SectionCard>
      )}

      <SectionCard
        title="Team members"
        subtitle="People with access to this workspace and their roles"
        headerAction={
          <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 400, alignSelf: 'center' }}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        }
      >
        {members.map((m, i) => (
          <MemberRow
            key={m.id}
            member={m}
            isCurrentUser={m.id === currentUserId}
            canRemove={isAdmin}
            onRemove={handleRemoveMember}
            isLast={i === members.length - 1}
          />
        ))}
      </SectionCard>

      <SectionCard
        title="Pending invites"
        subtitle="Invitations sent but not yet accepted"
        headerAction={
          <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 400 }}>0</span>
        }
      >
        <div
          style={{
            padding: '28px 22px',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-muted)',
            fontStyle: 'italic',
          }}
        >
          No pending invitations
        </div>
      </SectionCard>
    </>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 22,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55 }}>{subtitle}</div>
    </div>
  )
}

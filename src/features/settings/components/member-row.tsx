'use client'

import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { capitalize, formatLongDate } from '@/utils/format'
import type { TeamMember } from '@/types/api'

interface MemberRowProps {
  member: TeamMember
  isCurrentUser: boolean
  canRemove: boolean
  onRemove: (member: TeamMember) => void
}

/** One person in the team list. */
export function MemberRow({ member, isCurrentUser, canRemove, onRemove }: MemberRowProps) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-3.5 first:border-t-0">
      <Avatar name={member.email} size="md" />

      <div className="min-w-0 flex-1">
        <b className="block truncate text-body-lg font-semibold text-ink">{member.email}</b>
        <span className="text-stat-label text-text3">
          Joined {formatLongDate(new Date(member.created_at))}
        </span>
      </div>

      <StatusPill tone={member.role === 'admin' ? 'ok' : 'mark'}>
        {capitalize(member.role)}
      </StatusPill>
      {isCurrentUser && (
        <StatusPill tone="neutral">You</StatusPill>
      )}

      {canRemove && !isCurrentUser && (
        <button
          type="button"
          onClick={() => onRemove(member)}
          className="rounded-md border border-line2 px-2.5 py-1 text-caption text-text2 transition-colors hover:border-danger-line hover:bg-danger-bg hover:text-danger"
        >
          Remove
        </button>
      )}
    </div>
  )
}

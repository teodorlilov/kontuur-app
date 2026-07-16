'use client'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { capitalize } from '@/utils/format'
import type { TeamMember } from '@/types/api'

interface MemberRowProps {
  member: TeamMember
  isCurrentUser: boolean
  canRemove: boolean
  onRemove: (memberId: string) => void
  isLast?: boolean
}

function formatJoinDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Single member row in the team members list. */
export function MemberRow({ member, isCurrentUser, canRemove, onRemove, isLast }: MemberRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 22px',
        borderBottom: isLast ? 'none' : '0.5px solid rgba(44,62,80,0.055)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F9F6F2')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Avatar name={member.email} size="md" color="brand" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {member.email}
          {isCurrentUser && <Badge variant="default">you</Badge>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
          Joined {formatJoinDate(member.created_at)}
        </div>
      </div>

      <Badge variant={member.role === 'admin' ? 'info' : 'default'}>{capitalize(member.role)}</Badge>

      {canRemove && !isCurrentUser && (
        <button
          onClick={() => onRemove(member.id)}
          style={{
            padding: '5px 10px',
            background: 'none',
            border: '0.5px solid rgba(44,62,80,0.14)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--color-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#E8C4BB'
            e.currentTarget.style.color = '#A04030'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'
            e.currentTarget.style.color = 'var(--color-muted)'
          }}
        >
          Remove
        </button>
      )}
    </div>
  )
}

'use client'

import { Button } from '@/components/ui/button'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import { formatDateChip } from '@/utils/format-date-chip'

interface ReviewHeaderProps {
  pendingCount: number
  approvedCount: number
  onApproveAll: () => void
}

/** Top bar for the review queue with title, status badges, and approve-all action. */
export function ReviewHeader({ pendingCount, approvedCount, onApproveAll }: ReviewHeaderProps) {
  return (
    <div
      style={{
        height: '48px',
        background: 'var(--color-surface)',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: '14px',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)' }}>
        Review queue
      </span>
      {pendingCount > 0 && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '10px',
            background: 'rgba(76,145,115,0.10)',
            color: 'var(--status-ok)',
          }}
        >
          {pendingCount} pending
        </span>
      )}
      {approvedCount > 0 && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '10px',
            background: 'rgba(76,145,115,0.10)',
            color: 'var(--status-ok)',
          }}
        >
          {approvedCount} approved
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            background: '#fff',
            border: '0.5px solid rgba(44,62,80,0.10)',
            padding: '6px 12px',
            borderRadius: 7,
            letterSpacing: '0.3px',
          }}
        >
          {formatDateChip()}
        </span>
        <Button
          onClick={onApproveAll}
          disabled={pendingCount === 0}
          variant="secondary"
          size="sm"
        >
          Approve all
        </Button>
        <NotificationsBell />
      </div>
    </div>
  )
}

'use client'

import { Check, MessageCircle } from 'lucide-react'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'

interface ClientResponseCardProps {
  approvalStatus: 'approved' | 'changes_requested'
  clientNote: string | null
  respondedAt: string | null
  clientName: string
}

const STYLES = {
  approved: {
    border: 'rgba(46,158,104,0.25)',
    headerBg: 'rgba(46,158,104,0.04)',
    iconBg: 'rgba(46,158,104,0.12)',
    iconColor: 'var(--spring-text)',
    label: 'approved this post',
    fallback: 'Approved as-is — no changes requested',
  },
  changes_requested: {
    border: 'rgba(22,68,48,0.20)',
    headerBg: 'rgba(22,68,48,0.04)',
    iconBg: 'rgba(22,68,48,0.10)',
    iconColor: 'var(--forest)',
    label: 'requested changes',
    fallback: 'No specific feedback provided',
  },
} as const

/** Card showing client approval status and feedback at the top of the calendar post detail. */
export function ClientResponseCard({
  approvalStatus,
  clientNote,
  respondedAt,
  clientName,
}: ClientResponseCardProps) {
  const s = STYLES[approvalStatus]
  const Icon = approvalStatus === 'approved' ? Check : MessageCircle
  const timeAgo = respondedAt ? formatRelativeTime(parseTimestamp(respondedAt)) : null

  return (
    <div
      style={{
        border: `1px solid ${s.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: s.headerBg,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: s.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={13} color={s.iconColor} />
        </div>
        <div>
          <div className="text-body font-medium text-ink">
            {clientName} {s.label}
          </div>
          {timeAgo && (
            <div className="text-micro text-text2" style={{ marginTop: 1 }}>
              {timeAgo} · via review link
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px' }}>
        <div
          className="text-body"
          style={{
            color: 'var(--ink)',
            fontStyle: 'italic',
            lineHeight: 1.55,
          }}
        >
          {clientNote || s.fallback}
        </div>
      </div>
    </div>
  )
}

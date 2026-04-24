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
    border: 'rgba(90,138,74,0.25)',
    headerBg: 'rgba(90,138,74,0.04)',
    iconBg: 'rgba(90,138,74,0.12)',
    iconColor: '#5A8A4A',
    label: 'approved this post',
    fallback: 'Approved as-is — no changes requested',
  },
  changes_requested: {
    border: 'rgba(44,94,138,0.20)',
    headerBg: 'rgba(44,94,138,0.04)',
    iconBg: 'rgba(44,94,138,0.10)',
    iconColor: '#2C5F8A',
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
        border: `0.5px solid ${s.border}`,
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
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1A2630' }}>
            {clientName} {s.label}
          </div>
          {timeAgo && (
            <div style={{ fontSize: 11, color: '#8A8070', marginTop: 1 }}>
              {timeAgo} · via review link
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            fontSize: 13,
            color: '#1A2630',
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

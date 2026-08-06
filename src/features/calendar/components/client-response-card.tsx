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
    // The three tints below are picked out of STYLES by approval status, so
    // they stay values rather than classes.
    <div className="overflow-hidden rounded-[12px] border" style={{ borderColor: s.border }}>
      {/* Header */}
      <div className="flex items-center gap-[9px] px-3.5 py-3" style={{ background: s.headerBg }}>
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: s.iconBg }}
        >
          <Icon size={13} color={s.iconColor} />
        </div>
        <div>
          <div className="text-body font-medium text-ink">
            {clientName} {s.label}
          </div>
          {timeAgo && (
            <div className="mt-px text-micro text-text2">{timeAgo} · via review link</div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3.5 py-2.5">
        {/* leading-[1.55]: a quoted note in italic sets tighter than Body's 1.6,
            so the block reads as one voice rather than a list of lines. */}
        <div className="text-body italic leading-[1.55] text-ink">{clientNote || s.fallback}</div>
      </div>
    </div>
  )
}

'use client'

import { LayoutGrid, Clock, Check, MessageCircle } from 'lucide-react'
import { formatDateChip } from '@/utils/format-date-chip'

interface ReviewHeaderProps {
  agencyName: string
  clientName: string
  dateRange: string
  platform: string
  totalCount: number
  pendingCount: number
  approvedCount: number
  changesCount: number
}

type ChipColour = 'total' | 'pending' | 'approved' | 'changes'

const CHIP_STYLES: Record<ChipColour, { bg: string; color: string }> = {
  total: { bg: 'rgba(44,62,80,0.07)', color: '#1A2630' },
  pending: { bg: 'rgba(192,123,85,0.10)', color: '#C07B55' },
  approved: { bg: 'rgba(90,138,74,0.10)', color: '#5A8A4A' },
  changes: { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
}

const CHIP_ICONS: Record<ChipColour, typeof LayoutGrid> = {
  total: LayoutGrid,
  pending: Clock,
  approved: Check,
  changes: MessageCircle,
}

/** Small coloured chip showing a count and label. */
function StatusChip({ label, colour }: { label: string; colour: ChipColour }) {
  const s = CHIP_STYLES[colour]
  const Icon = CHIP_ICONS[colour]
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        background: s.bg,
        color: s.color,
      }}
    >
      <Icon size={11} />
      {label}
    </div>
  )
}

/** Page header with agency name, title, meta info, and status chips. */
export function ReviewHeader({
  agencyName,
  clientName,
  dateRange,
  platform,
  totalCount,
  pendingCount,
  approvedCount,
  changesCount,
}: ReviewHeaderProps) {
  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '0.5px solid rgba(44,62,80,0.10)',
        padding: '18px 28px 16px',
        flexShrink: 0,
      }}
    >
      {/* Top row: agency + date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            fontWeight: 500,
            color: '#8A8070',
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
          }}
        >
          <div
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#C07B55' }}
          />
          {agencyName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#8A8070',
            background: '#F4EFE6',
            border: '0.5px solid rgba(44,62,80,0.12)',
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          {formatDateChip()}
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 24,
          fontWeight: 400,
          color: '#1A2630',
          marginBottom: 6,
        }}
      >
        Posts for review
      </div>

      {/* Meta */}
      <div
        style={{
          fontSize: 12,
          color: '#8A8070',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span>{clientName}</span>
        <span style={{ color: 'rgba(44,62,80,0.20)' }}>·</span>
        <span>{dateRange}</span>
        <span style={{ color: 'rgba(44,62,80,0.20)' }}>·</span>
        <span>{platform}</span>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        <StatusChip label={`${totalCount} posts`} colour="total" />
        {pendingCount > 0 && (
          <StatusChip label={`${pendingCount} pending`} colour="pending" />
        )}
        {approvedCount > 0 && (
          <StatusChip label={`${approvedCount} approved`} colour="approved" />
        )}
        {changesCount > 0 && (
          <StatusChip label={`${changesCount} feedback sent`} colour="changes" />
        )}
      </div>
    </div>
  )
}

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
  total: { bg: 'var(--sunken)', color: 'var(--ink)' },
  // Four chips, four states. Pending is a wait (Amber), approved is settled
  // (Wash), changes-requested needs you (Clay). They were terracotta and green
  // aliases of each other, so pending and approved read identically.
  pending: { bg: 'var(--pending-bg)', color: 'var(--pending)' },
  approved: { bg: 'var(--wash)', color: 'var(--forest)' },
  changes: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
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
        borderBottom: '1px solid rgba(15,21,18,0.10)',
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
            color: 'var(--text2)',
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
          }}
        >
          <div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--spring-text)' }}
          />
          {agencyName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text2)',
            background: 'var(--paper)',
            border: '1px solid rgba(15,21,18,0.12)',
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
          color: 'var(--ink)',
          marginBottom: 6,
        }}
      >
        Posts for review
      </div>

      {/* Meta */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span>{clientName}</span>
        <span style={{ color: 'rgba(15,21,18,0.20)' }}>·</span>
        <span>{dateRange}</span>
        <span style={{ color: 'rgba(15,21,18,0.20)' }}>·</span>
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

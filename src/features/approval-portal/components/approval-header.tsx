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
      className="inline-flex items-center gap-[5px] rounded-[6px] px-2.5 py-1 text-micro font-medium"
      style={{ background: s.bg, color: s.color }}
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
    <div className="shrink-0 border-b border-ink/10 bg-surface px-7 pb-4 pt-[18px]">
      {/* Top row: agency + date */}
      <div className="mb-3.5 flex items-center justify-between">
        {/* tracking-[2px]: wider than the Label role's own 0.16em (1.6px at its 10px
            step) — the agency name is the page's widest-set mark. */}
        <div className="flex items-center gap-2 text-label font-medium uppercase tracking-[2px] text-text2">
          <div className="h-1.5 w-1.5 rounded-full bg-spring-text" />
          {agencyName}
        </div>
        <div className="rounded-[6px] border border-ink/12 bg-paper px-2.5 py-1 text-micro text-text2">
          {formatDateChip()}
        </div>
      </div>

      {/* Title */}
      <div className="mb-1.5 font-display text-headline font-normal text-ink">Posts for review</div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2.5 text-caption text-text2">
        <span>{clientName}</span>
        <span className="text-ink/20">·</span>
        <span>{dateRange}</span>
        <span className="text-ink/20">·</span>
        <span>{platform}</span>
      </div>

      {/* Status chips */}
      <div className="mt-3 flex gap-[7px]">
        <StatusChip label={`${totalCount} posts`} colour="total" />
        {pendingCount > 0 && <StatusChip label={`${pendingCount} pending`} colour="pending" />}
        {approvedCount > 0 && <StatusChip label={`${approvedCount} approved`} colour="approved" />}
        {changesCount > 0 && (
          <StatusChip label={`${changesCount} feedback sent`} colour="changes" />
        )}
      </div>
    </div>
  )
}

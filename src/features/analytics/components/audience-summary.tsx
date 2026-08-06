'use client'

import { useShell } from '@/components/layout/shell-context'
import { cn } from '@/utils/cn'
import { formatDayMonth } from '@/utils/format'

interface AudienceSummaryProps {
  total: number
  newCount: number
  unfollows: number
  netGrowth: number
  followersDeltaPct: number | null
}

/** 4-cell follower summary card for the audience tab. */
export function AudienceSummary({
  total,
  newCount,
  unfollows,
  netGrowth,
  followersDeltaPct,
}: AudienceSummaryProps) {
  const { timezone } = useShell()
  // The agency's today, not the browser's: this renders on the server and again after hydration.
  const today = formatDayMonth(new Date(), timezone)
  const deltaLabel =
    followersDeltaPct != null
      ? `${followersDeltaPct >= 0 ? '↑' : '↓'} ${followersDeltaPct > 0 ? '+' : ''}${followersDeltaPct}% vs last period`
      : 'in selected period'

  const cells = [
    {
      label: 'Total followers',
      value: total.toLocaleString(),
      colour: 'var(--ink)',
      sub: `as of ${today}`,
    },
    { label: 'New followers', value: `+${newCount}`, colour: 'var(--metric-3)', sub: deltaLabel },
    {
      label: 'Unfollowers',
      value: `−${unfollows}`,
      colour: 'var(--text2)',
      sub: 'in selected period',
    },
    {
      label: 'Net growth',
      value: netGrowth >= 0 ? `+${netGrowth}` : `−${Math.abs(netGrowth)}`,
      colour: netGrowth >= 0 ? 'var(--metric-3)' : 'var(--danger)',
      sub: 'total change',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-line rounded-lg bg-surface overflow-hidden mb-3.5">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn(
            'px-5 py-[18px]',
            i < 3 ? 'border-r border-r-ink/6' : '',
            i % 2 === 0 ? '' : 'max-md:!border-r-0',
            i < 2 ? 'max-md:border-b max-md:border-b-[rgba(15,21,18,0.06)]' : ''
          )}
        >
          <div className="text-label font-semibold uppercase text-text2 mb-2">{cell.label}</div>
          {/* leading-none is the figure's original line-height of 1 — tighter than
              text-metric's 1.1 so the number sits flush against its caption. */}
          <div
            className="text-metric font-display font-normal leading-none mb-[5px]"
            style={{ color: cell.colour }}
          >
            {cell.value}
          </div>
          <div className="text-micro text-text2">{cell.sub}</div>
        </div>
      ))}
    </div>
  )
}

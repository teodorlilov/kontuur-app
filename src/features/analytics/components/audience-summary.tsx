'use client'

import { useShell } from '@/components/layout/shell-context'
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
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)',
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={[
            i % 2 === 0 ? '' : 'max-md:!border-r-0',
            i < 2 ? 'max-md:border-b max-md:border-b-[rgba(15,21,18,0.06)]' : '',
          ].join(' ')}
          style={{
            padding: '18px 20px',
            borderRight: i < 3 ? '1px solid rgba(15,21,18,0.06)' : 'none',
          }}
        >
          <div
            className="text-label font-semibold uppercase text-text2"
            style={{ marginBottom: 8 }}
          >
            {cell.label}
          </div>
          <div
            className="text-metric"
            style={{
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontWeight: 400,
              color: cell.colour,
              lineHeight: 1,
              marginBottom: 5,
            }}
          >
            {cell.value}
          </div>
          <div className="text-micro text-text2">{cell.sub}</div>
        </div>
      ))}
    </div>
  )
}

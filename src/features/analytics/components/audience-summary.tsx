'use client'

interface AudienceSummaryProps {
  total: number
  newCount: number
  unfollows: number
  netGrowth: number
  followersDeltaPct: number | null
}

/** Unified 4-cell follower summary card for the audience tab. */
export function AudienceSummary({ total, newCount, unfollows, netGrowth, followersDeltaPct }: AudienceSummaryProps) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const deltaLabel = followersDeltaPct != null
    ? `${followersDeltaPct >= 0 ? '↑' : '↓'} ${followersDeltaPct > 0 ? '+' : ''}${followersDeltaPct}% vs last period`
    : 'in selected period'

  const cells = [
    { label: 'Total followers', value: total.toLocaleString(), colour: 'var(--color-text-1)', sub: `as of ${today}` },
    { label: 'New followers', value: `+${newCount}`, colour: 'var(--accent-m3)', sub: deltaLabel },
    { label: 'Unfollowers', value: `−${unfollows}`, colour: 'var(--color-muted)', sub: 'in selected period' },
    {
      label: 'Net growth',
      value: netGrowth >= 0 ? `+${netGrowth}` : `−${Math.abs(netGrowth)}`,
      colour: netGrowth >= 0 ? 'var(--accent-m3)' : '#B43232',
      sub: 'total change',
    },
  ]

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={[
            i % 2 === 0 ? '' : 'max-md:!border-r-0',
            i < 2 ? 'max-md:border-b max-md:border-b-[rgba(44,62,80,0.06)]' : '',
          ].join(' ')}
          style={{
            padding: '18px 20px',
            borderRight: i < 3 ? '0.5px solid rgba(44,62,80,0.06)' : 'none',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: 'var(--color-muted)',
              letterSpacing: '1.1px',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {cell.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontSize: 32,
              fontWeight: 400,
              color: cell.colour,
              lineHeight: 1,
              marginBottom: 5,
            }}
          >
            {cell.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cell.sub}</div>
        </div>
      ))}
    </div>
  )
}

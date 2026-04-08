'use client'

interface StatCardProps {
  label: string
  value: string | number
  deltaPct?: number | null
}

export function StatCard({ label, value, deltaPct }: StatCardProps) {
  const showDelta = deltaPct !== null && deltaPct !== undefined
  const isUp = (deltaPct ?? 0) >= 0

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        transition: 'border-color 150ms ease, transform 150ms ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-2)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-1)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--color-text-3)',
          margin: '0 0 10px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        {value}
      </p>
      {showDelta && (
        <p
          style={{
            fontSize: 12,
            color: isUp ? 'var(--color-published-fg)' : 'var(--color-error-fg)',
            margin: '6px 0 0',
          }}
        >
          {isUp ? '↑' : '↓'} {Math.abs(deltaPct!)}% vs last period
        </p>
      )}
    </div>
  )
}

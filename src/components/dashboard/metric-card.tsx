'use client'

import { TrendingUp, AlertTriangle } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: number | string
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
  accentColor: string
}

const DELTA_COLOR = {
  positive: 'var(--status-ok)',
  negative: 'var(--color-terracotta)',
  neutral: 'var(--color-muted)',
} as const

/** Dashboard metric card with coloured top accent border. */
export function MetricCard({ label, value, delta, deltaType = 'neutral', accentColor }: MetricCardProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: 12,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accentColor,
        }}
      />

      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 36,
          fontWeight: 400,
          color: '#1A2630',
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {value}
      </div>

      {delta && (
        <div
          style={{
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: DELTA_COLOR[deltaType],
          }}
        >
          {deltaType === 'positive' && <TrendingUp size={10} />}
          {deltaType === 'negative' && <AlertTriangle size={10} />}
          {delta}
        </div>
      )}
    </div>
  )
}

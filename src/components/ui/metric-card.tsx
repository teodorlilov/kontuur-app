import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'

interface MetricCardProps {
  label: string
  value: number | string
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
  /** Top accent bar — pass a token, e.g. 'var(--spring)'. */
  accentColor: string
}

const DELTA_CLASSES = {
  /* Living Green Text, not --spring: green as a word on light needs 4.53:1, and
     --spring is 3.38:1. See DESIGN.md § Don't set green text in Living Green. */
  positive: 'text-spring-text',
  negative: 'text-pending',
  neutral: 'text-text3',
} as const

/** Metric card with a coloured top accent border. */
export function MetricCard({ label, value, delta, deltaType = 'neutral', accentColor }: MetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-panel border border-ink/[0.05] bg-surface px-5 py-[18px]">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accentColor }} />

      <div className="mb-2.5 text-micro font-medium uppercase tracking-[0.12em] text-text3">
        {label}
      </div>

      <div className="text-metric font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
        {value}
      </div>

      {delta && (
        <div className={cn('mt-1.5 flex items-center gap-1 text-[11px]', DELTA_CLASSES[deltaType])}>
          {deltaType === 'positive' && <TrendingUp size={10} />}
          {deltaType === 'negative' && <TrendingDown size={10} />}
          {delta}
        </div>
      )}
    </div>
  )
}

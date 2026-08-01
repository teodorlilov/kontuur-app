import { cn } from '@/utils/cn'
import { PILL_TONES } from '@/components/ui/status-pill'
import { CountUp } from '@/features/dashboard/components/count-up'
import type { StatPillTone } from '@/features/dashboard/types'

/**
 * This card's tone vocabulary resolved against the shared pill tones. Only the
 * two that have no shared equivalent are stated here: `muted` takes the sunken
 * fill rather than StatusPill's translucent ink, and `accent` exists solely for
 * the dark card below.
 */
const PILL_CLASSES: Record<StatPillTone, string> = {
  positive: PILL_TONES.ok,
  attention: PILL_TONES.warn,
  danger: PILL_TONES.bad,
  muted: 'bg-sunken text-text3',
  // Dark card only: lime at 15% keeps the pill subordinate to the figure it
  // sits beside. StatusPill's solid `mark` would out-shout it.
  accent: 'bg-accent/15 text-accent',
}

interface StatCardProps {
  label: string
  /**
   * Omit it when `children` carry the body instead of a figure. `null` means
   * the query failed: the card shows an explicit unknown rather than a zero
   * the user would read as real.
   */
  value?: number | null
  icon: React.ReactNode
  pill?: { text: string; tone: StatPillTone }
  footer?: React.ReactNode
  /** The dark treatment marks the card the week hinges on. */
  dark?: boolean
  children?: React.ReactNode
}

export function StatCard({ label, value, icon, pill, footer, dark, children }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card px-[18px] py-4',
        dark
          ? 'surface-dark border-transparent text-white shadow-dark'
          : 'border border-ink/[0.05] bg-surface'
      )}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span
          className={cn(
            'grid size-[38px] place-items-center rounded-panel',
            dark ? 'bg-white/10 text-white' : 'bg-sunken text-text2'
          )}
        >
          {icon}
        </span>
        {pill && (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              // Wash-on-forest is unreadable, so the dark card promotes a
              // positive pill to the lime accent.
              PILL_CLASSES[dark && pill.tone === 'positive' ? 'accent' : pill.tone]
            )}
          >
            {pill.text}
          </span>
        )}
      </div>

      <div className={cn('text-[12.5px] font-medium', dark ? 'text-white/60' : 'text-text3')}>
        {label}
      </div>
      {value !== undefined && (
        <div className="mt-[3px] text-[31px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
          {value === null ? (
            <span aria-label="Unavailable" title="This figure could not be loaded">
              &mdash;
            </span>
          ) : (
            <CountUp value={value} />
          )}
        </div>
      )}

      {children}

      {footer && (
        <div
          className={cn(
            'mt-3 flex items-center gap-2 text-[11.5px]',
            dark ? 'text-white/60' : 'text-text3'
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

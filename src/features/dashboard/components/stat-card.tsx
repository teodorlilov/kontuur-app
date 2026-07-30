import { cn } from '@/utils/cn'
import { CountUp } from '@/features/dashboard/components/count-up'
import type { StatPillTone } from '@/features/dashboard/types'

const PILL_CLASSES: Record<StatPillTone, string> = {
  positive: 'bg-wash text-forest',
  attention: 'bg-pending-bg text-pending',
  muted: 'bg-sunken text-text3',
  accent: 'bg-accent/15 text-accent',
  // A publish that did not ship is an error, and errors are clay.
  danger: 'bg-danger-bg text-danger',
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
          : 'border border-ink/[0.05] bg-[image:var(--raised)] shadow-card'
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

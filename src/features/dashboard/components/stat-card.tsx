import { cn } from '@/utils/cn'
import { CountUp } from '@/features/dashboard/components/count-up'

export type StatPillTone = 'positive' | 'attention' | 'muted' | 'accent'

const PILL_CLASSES: Record<StatPillTone, string> = {
  positive: 'bg-wash text-forest',
  attention: 'bg-pending-bg text-pending',
  muted: 'bg-sunken text-text3',
  accent: 'bg-accent/15 text-accent',
}

interface StatCardProps {
  label: string
  value: number
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
          ? 'border-transparent text-white shadow-dark'
          : 'border border-ink/[0.05] bg-[image:var(--raised)] shadow-card'
      )}
      style={
        dark
          ? {
              background: 'var(--dot-grid), linear-gradient(180deg, #113429 0%, #0E2B21 100%)',
              backgroundSize: '13px 13px, 100% 100%',
            }
          : undefined
      }
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
              dark && pill.tone === 'positive' ? 'bg-accent/15 text-accent' : PILL_CLASSES[pill.tone]
            )}
          >
            {pill.text}
          </span>
        )}
      </div>

      <div className={cn('text-[12.5px] font-medium', dark ? 'text-white/60' : 'text-text3')}>
        {label}
      </div>
      <div className="mt-[3px] text-[31px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
        <CountUp value={value} />
      </div>

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

import { Card } from '@/components/ui/card'
import { cn } from '@/utils/cn'

interface AnalyticsSectionProps {
  title: string
  sub?: React.ReactNode
  legend?: React.ReactNode
  ariaLabel: string
  children: React.ReactNode
}

/** One clearing of the document: title, quiet subtitle, optional legend, chart. */
export function AnalyticsSection({
  title,
  sub,
  legend,
  ariaLabel,
  children,
}: AnalyticsSectionProps) {
  return (
    <Card className="px-6 pb-6 pt-5">
      <section aria-label={ariaLabel}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h3 className="text-title text-ink">{title}</h3>
            {sub && <p className="max-w-[62ch] text-caption text-text2">{sub}</p>}
          </div>
          {legend}
        </div>
        {children}
      </section>
    </Card>
  )
}

const SWATCH_CLASS = {
  now: 'h-0.5 w-3.5 rounded-full bg-forest',
  then: 'h-0.5 w-3.5 rounded-full bg-metric-3',
  'dot-now': 'size-2 rounded-full bg-forest',
  'dot-second': 'size-2 rounded-full bg-spring',
  /** The last-period marker line drawn across the audience columns. */
  tick: 'h-0.5 w-3.5 rounded-full bg-then-line',
  /** A publish day pinned on the reach baseline. */
  pin: 'size-2.5 rounded-full border-2 border-forest bg-surface',
  /** The comparison window's publish day, on the row beneath. */
  'pin-then': 'size-2 rounded-full border-2 border-then-line bg-surface',
  /** The comparison line: dashed, so the pair never rests on hue alone. */
  'then-dashed':
    'h-0.5 w-3.5 bg-[linear-gradient(to_right,var(--then-line)_0_60%,transparent_60%_100%)] bg-[length:6px_2px] bg-repeat-x',
} as const

export type LegendSwatch = keyof typeof SWATCH_CLASS

/**
 * The two-series legend. Decorative (the charts carry sr-only sentences), so
 * it is hidden from readers rather than narrated twice.
 */
export function ChartLegend({ items }: { items: Array<{ swatch: LegendSwatch; label: string }> }) {
  return (
    <div className="flex flex-none items-center gap-4" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-micro font-medium text-text2"
        >
          <i className={cn('inline-block', SWATCH_CLASS[item.swatch])} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

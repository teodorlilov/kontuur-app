import { cn } from '@/utils/cn'
import { Card } from '@/components/ui/card'
import type { AnalyticsReportData } from '../lib/build-report'
import { formatCount } from '../lib/format'
import { DeltaChip } from './delta-chip'
import { Sparkline } from './sparkline'

interface CellSpec {
  label: string
  value: string | null
  delta: number | null
  deltaUnit: 'pct' | 'pt'
  thenLine: string
  series: Array<number | null>
  /** The sr-only sentence that speaks for the aria-hidden sparkline. */
  spoken: string
}

function cellSpecs(data: AnalyticsReportData): CellSpec[] {
  const simple = (
    label: string,
    cell: {
      now: number | null
      then: number | null
      deltaPct: number | null
      series: Array<number | null>
    }
  ): CellSpec => ({
    label,
    value: cell.now === null ? null : formatCount(cell.now),
    delta: cell.deltaPct,
    deltaUnit: 'pct',
    thenLine:
      cell.then === null ? 'no previous period yet' : `${formatCount(cell.then)} last period`,
    series: cell.series,
    spoken:
      cell.now === null
        ? `${label}: not captured for this period.`
        : `${label}: ${formatCount(cell.now)} this period, ${
            cell.then === null
              ? 'no previous period to compare'
              : `${formatCount(cell.then)} the period before`
          }.`,
  })

  const { followers, engagementRate } = data
  const net = followers.net.now
  const netParts = [
    followers.gained.now !== null ? `${formatCount(followers.gained.now)} gained` : null,
    followers.lost.now !== null ? `${formatCount(followers.lost.now)} lost` : null,
    followers.total !== null ? `${formatCount(followers.total)} total` : null,
  ].filter((part): part is string => part !== null)

  return [
    simple('Views', data.views),
    simple('Reach', data.reach),
    simple('Interactions', data.interactions),
    {
      label: 'Net followers',
      value: net === null ? null : `${net >= 0 ? '+' : '−'}${formatCount(Math.abs(net))}`,
      // A percent of a tiny or negative base misleads; only a real positive base compares.
      delta:
        net !== null && followers.net.then !== null && followers.net.then > 0
          ? ((net - followers.net.then) / followers.net.then) * 100
          : null,
      deltaUnit: 'pct',
      thenLine: netParts.length > 0 ? netParts.join(' · ') : 'no follower data yet',
      series: followers.series,
      spoken:
        net === null
          ? 'Net followers: not captured for this period.'
          : `Net followers: ${net >= 0 ? 'plus' : 'minus'} ${formatCount(Math.abs(net))} this period${
              followers.net.then !== null
                ? `, against ${formatCount(followers.net.then)} the period before`
                : ''
            }.`,
    },
    {
      label: 'Engagement rate',
      value: engagementRate.now === null ? null : `${engagementRate.now.toFixed(1)}%`,
      delta: engagementRate.deltaPt,
      deltaUnit: 'pt',
      thenLine:
        engagementRate.then === null
          ? 'no previous period yet'
          : `${engagementRate.then.toFixed(1)}% last period`,
      series: engagementRate.series,
      spoken:
        engagementRate.now === null
          ? 'Engagement rate: not captured for this period.'
          : `Engagement rate: ${engagementRate.now.toFixed(1)} percent this period${
              engagementRate.then === null
                ? ''
                : `, ${engagementRate.then.toFixed(1)} the period before`
            }.`,
    },
  ]
}

/**
 * The five-cell hairline strip (direction-01 idiom, comparison grammar):
 * Label over Metric, delta chip, last period's value, thirty-day trace.
 * Day-one cells hold the exact height of their occupied twins.
 */
export function SummaryStrip({ data }: { data: AnalyticsReportData }) {
  const cells = cellSpecs(data)
  return (
    // One clearing, not five floating columns: the strip is a Card like every
    // other section, and the hairlines divide cells INSIDE its surface.
    <Card className="px-6 py-1.5">
      <section aria-label="Headline metrics">
        <h3 className="sr-only">Headline metrics, this period against the previous period</h3>
        <div className="grid grid-cols-2 md:grid-cols-5">
          {cells.map((cell, index) => (
            <div
              key={cell.label}
              className={cn(
                'min-w-0 py-4 pr-5',
                index % 2 === 1 && 'border-l border-ink/[0.05] pl-5',
                index >= 2 && 'border-t border-ink/[0.05] md:border-t-0',
                index > 0 && 'md:border-l md:border-ink/[0.05] md:pl-5'
              )}
            >
              <div className="text-label text-text3">{cell.label}</div>
              {data.hasHistory ? (
                <>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-metric text-ink">{cell.value ?? '—'}</span>
                    <DeltaChip value={cell.delta} unit={cell.deltaUnit} />
                  </div>
                  <div className="mt-1 text-micro tabular-nums text-text3">
                    {cell.value === null ? 'not captured for this period' : cell.thenLine}
                  </div>
                  <Sparkline values={cell.series} />
                  <span className="sr-only">{cell.spoken}</span>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-metric text-text3">—</span>
                  </div>
                  <div className="mt-1 text-micro text-text3">counts from tonight</div>
                  <div className="slot-open mt-2.5 h-7 rounded-chip" aria-hidden="true" />
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </Card>
  )
}

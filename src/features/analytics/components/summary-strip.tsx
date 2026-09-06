import { cn } from '@/utils/cn'
import { Card } from '@/components/ui/card'
import type { AnalyticsReportData, FollowerSummary } from '../lib/instagram/build-report'
import {
  countDeltaVerdict,
  rateDeltaVerdict,
  type DeltaVerdict,
} from '../lib/compute/delta-verdict'
import { formatCount, signedCount } from '../lib/compute/format'
import { DeltaChip } from './delta-chip'
import { Sparkline } from './sparkline'

interface CellSpec {
  label: string
  value: string | null
  verdict: DeltaVerdict
  unit: 'count' | 'pt'
  thenLine: string
  series: Array<number | null>
  /** The sr-only sentence that speaks for the aria-hidden sparkline. */
  spoken: string
}

/** One count-shaped cell: value, verdict, last period's line, trace — both networks' grammar. */
export function countCellSpec(
  label: string,
  cell: {
    now: number | null
    then: number | null
    series: Array<number | null>
  }
): CellSpec {
  return {
    label,
    value: cell.now === null ? null : formatCount(cell.now),
    verdict: countDeltaVerdict(cell.now, cell.then),
    unit: 'count',
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
  }
}

/** The net-followers cell — shared because both networks tell the follower story identically. */
export function netFollowersCellSpec(followers: FollowerSummary): CellSpec {
  const net = followers.net.now
  const netParts = [
    followers.gained.now !== null ? `${formatCount(followers.gained.now)} gained` : null,
    followers.lost.now !== null ? `${formatCount(followers.lost.now)} lost` : null,
    followers.total !== null ? `${formatCount(followers.total)} total` : null,
  ].filter((part): part is string => part !== null)
  return {
    label: 'Net followers',
    value: net === null ? null : signedCount(net),
    verdict: countDeltaVerdict(net, followers.net.then),
    unit: 'count',
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
  }
}

function cellSpecs(data: AnalyticsReportData): CellSpec[] {
  const { engagementRate } = data
  return [
    countCellSpec('Views', data.views),
    countCellSpec('Reach', data.reach),
    countCellSpec('Interactions', data.interactions),
    netFollowersCellSpec(data.followers),
    {
      label: 'Engagement rate',
      value: engagementRate.now === null ? null : `${engagementRate.now.toFixed(1)}%`,
      // The rate's floor sits on its denominator: points only color when both
      // windows measured real reach (the ▼12.6pt-off-644-reach case).
      verdict: rateDeltaVerdict(engagementRate.deltaPt, data.reach.now, data.reach.then),
      unit: 'pt',
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
  return <StripCells cells={cellSpecs(data)} hasHistory={data.hasHistory} />
}

/**
 * The strip's rendering, cell-agnostic: the Instagram wrapper above feeds it five cells,
 * Facebook's view feeds it three — the grammar (label over metric, chip, last period, trace)
 * is the shared part, and which metrics exist is each network's own truth.
 */
export function StripCells({
  cells,
  hasHistory,
  gridClass = 'md:grid-cols-5',
}: {
  cells: CellSpec[]
  hasHistory: boolean
  gridClass?: string
}) {
  return (
    // One clearing, not five floating columns: the strip is a Card like every
    // other section, and the hairlines divide cells INSIDE its surface.
    <Card className="px-6 py-1.5">
      <section aria-label="Headline metrics">
        <h3 className="sr-only">Headline metrics, this period against the previous period</h3>
        <div className={cn('grid grid-cols-2', gridClass)}>
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
              {hasHistory ? (
                <>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-metric text-ink">{cell.value ?? '—'}</span>
                    <DeltaChip verdict={cell.verdict} unit={cell.unit} />
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

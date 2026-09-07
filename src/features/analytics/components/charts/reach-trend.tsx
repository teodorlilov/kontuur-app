'use client'

import { useState } from 'react'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { BestDay, ReachDay } from '../../lib/instagram/build-report'
import { CHART_COLORS } from '../../lib/compute/chart-config'
import { formatCount, formatDayMonth } from '../../lib/compute/format'
import { lineSegments, niceCeil, segmentsToPath } from '../../lib/compute/svg-path'
import { DayCard, DayCardPosts, DayCardRow } from './day-card'
import { ScrollToRecent } from './scroll-to-recent'

const W = 1120
const H = 296
/**
 * bottom carries four rows under the plot: this period's pins, the previous
 * period's pins, then a date label for each window.
 */
const PAD = { top: 16, right: 12, bottom: 62, left: 12 }
/** How far under the baseline the comparison window's pins sit. */
const THEN_PIN_DROP = 16

/** The chart's words, so a network that feeds it a different metric can say so. */
export interface TrendLabels {
  /** Lowercase, mid-sentence: "Daily reach…". */
  metric: string
  /** The day card's row label for the main line. */
  metricRow: string
  /** The day card's row label for the secondary value; the row hides when the day has none. */
  secondaryRow: string
  empty: string
}

const REACH_LABELS: TrendLabels = {
  metric: 'reach',
  metricRow: 'Reached',
  secondaryRow: 'Views',
  empty: 'No daily reach captured for this period yet — the nightly sync fills this in.',
}

/**
 * The hero comparison: daily reach as two 2px lines — this period in Deep Pine over a faint
 * wash, the previous period in the then-stroke — with the best day marked by the Living Green
 * now-dot and every publish day pinned on the baseline, so a spike can be read against the
 * post that caused it.
 *
 * The now-line draws in over the already-visible then-line via `.chart-draw-in`, which
 * globals.css cancels under both `prefers-reduced-motion` and `@media print` — either way the
 * finished state is what renders.
 *
 * One x-axis carries two windows, so nothing may rest on hue alone: the previous period is
 * dashed, both windows' dates print under every tick, and its publish days pin on their own row
 * at the ALIGNED x — the day card is where their real date is named.
 *
 * The wash under the now-line closes through `segmentsToPath` rather than a second inline point
 * formatter, so its edge and the line it fills under cannot round differently.
 */
export function ReachTrend({
  days,
  bestDay,
  labels = REACH_LABELS,
  networkLabel = PLATFORM_NAMES.instagram,
}: {
  days: ReachDay[]
  bestDay: BestDay | null
  labels?: TrendLabels
  /** Threaded to the hover card, which names the network a removed post is gone FROM. */
  networkLabel?: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  const nowValues = days.map((day) => day.now)
  const thenValues = days.map((day) => day.then)
  const real = [...nowValues, ...thenValues].filter((v): v is number => v !== null)
  if (real.length === 0 || days.length < 2) {
    return <p className="mt-4 text-caption text-text3">{labels.empty}</p>
  }

  const max = niceCeil(Math.max(...real))
  const step = (W - PAD.left - PAD.right) / (days.length - 1)
  const x = (index: number): number => PAD.left + index * step
  const y = (value: number): number => PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom)
  const baseline = H - PAD.bottom

  const nowSegments = lineSegments(nowValues, x, y)
  const thenSegments = lineSegments(thenValues, x, y)

  const nowPoints = nowSegments.flat()
  const washPath =
    nowPoints.length > 1
      ? `${segmentsToPath([nowPoints])} L${nowPoints[nowPoints.length - 1]!.x.toFixed(1)},${baseline} L${nowPoints[0]!.x.toFixed(1)},${baseline} Z`
      : null

  const peakIndex = bestDay ? days.findIndex((day) => day.date === bestDay.date) : -1
  const gridLines = [0.25, 0.5, 0.75]
  const tickIndexes = [
    0,
    Math.round((days.length - 1) / 4),
    Math.round((days.length - 1) / 2),
    Math.round(((days.length - 1) * 3) / 4),
    days.length - 1,
  ]

  const locate = (event: React.PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const view = ((event.clientX - rect.left) / rect.width) * W
    const index = Math.round((view - PAD.left) / step)
    setHover(Math.min(days.length - 1, Math.max(0, index)))
  }

  const hoveredDay = hover === null ? null : (days[hover] ?? null)
  const publishDays = days.filter((day) => day.posts.length > 0).length
  const thenPublishDays = days.filter((day) => day.thenPosts.length > 0).length

  const spoken = `Line chart. Daily ${labels.metric} for this period as a solid line against the previous period as a dashed one, each column labelled with both windows' dates.${
    bestDay ? ` Peaks at ${formatCount(bestDay.reach)} on ${formatDayMonth(bestDay.date)}.` : ''
  }${
    publishDays > 0
      ? ` ${publishDays} publish day${publishDays === 1 ? ' is' : 's are'} pinned under the baseline — the posts table below lists every post.`
      : ''
  }${
    thenPublishDays > 0
      ? ` The previous period published on ${thenPublishDays} day${thenPublishDays === 1 ? '' : 's'}, pinned on the row beneath.`
      : ''
  } Days without data are shown as gaps.`

  return (
    <ScrollToRecent className="mt-3.5 overflow-x-auto">
      <div className="min-w-3xl">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={spoken}
            className="block h-auto w-full"
            onPointerMove={locate}
            onPointerDown={locate}
            onPointerLeave={() => setHover(null)}
          >
            {gridLines.map((fraction) => {
              const gy = PAD.top + (1 - fraction) * (H - PAD.top - PAD.bottom)
              return (
                <g key={fraction}>
                  <line
                    x1={PAD.left}
                    y1={gy}
                    x2={W - PAD.right}
                    y2={gy}
                    stroke={CHART_COLORS.grid}
                    strokeWidth={1}
                  />
                  <text
                    x={W - PAD.right}
                    y={gy - 5}
                    textAnchor="end"
                    fill={CHART_COLORS.label}
                    className="text-micro tabular-nums"
                  >
                    {formatCount(Math.round(max * fraction))}
                  </text>
                </g>
              )
            })}
            {tickIndexes.map((index, position) => {
              const anchor =
                position === 0 ? 'start' : position === tickIndexes.length - 1 ? 'end' : 'middle'
              return (
                <g key={index}>
                  <text
                    x={x(index)}
                    y={H - 24}
                    textAnchor={anchor}
                    fill={CHART_COLORS.label}
                    className="text-micro"
                  >
                    {days[index] ? formatDayMonth(days[index].date) : ''}
                  </text>
                  <text
                    x={x(index)}
                    y={H - 8}
                    textAnchor={anchor}
                    fill={CHART_COLORS.thenLine}
                    className="text-micro"
                  >
                    {days[index] ? formatDayMonth(days[index].thenDate) : ''}
                  </text>
                </g>
              )
            })}
            {washPath && <path d={washPath} fill={CHART_COLORS.now} opacity={0.06} />}
            <path
              d={segmentsToPath(thenSegments)}
              fill="none"
              stroke={CHART_COLORS.thenLine}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={segmentsToPath(nowSegments)}
              fill="none"
              stroke={CHART_COLORS.now}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              className="chart-draw-in"
            />
            {hover !== null && hoveredDay && (
              <g aria-hidden="true" className="print:hidden">
                <line
                  x1={x(hover)}
                  y1={PAD.top}
                  x2={x(hover)}
                  y2={baseline}
                  stroke={CHART_COLORS.label}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
                {hoveredDay.then !== null && (
                  <circle
                    cx={x(hover)}
                    cy={y(hoveredDay.then)}
                    r={3}
                    fill={CHART_COLORS.thenLine}
                  />
                )}
                {hoveredDay.now !== null && (
                  <>
                    <circle cx={x(hover)} cy={y(hoveredDay.now)} r={5} fill="#fff" />
                    <circle cx={x(hover)} cy={y(hoveredDay.now)} r={3.5} fill={CHART_COLORS.now} />
                  </>
                )}
              </g>
            )}
            {peakIndex >= 0 && bestDay && (
              <g>
                <circle cx={x(peakIndex)} cy={y(bestDay.reach)} r={6} fill="#fff" />
                <circle cx={x(peakIndex)} cy={y(bestDay.reach)} r={4} fill={CHART_COLORS.instant} />
                <text
                  x={x(peakIndex)}
                  y={y(bestDay.reach) - 12}
                  textAnchor="middle"
                  fill={CHART_COLORS.ink}
                  className="text-micro font-semibold tabular-nums"
                >
                  {formatCount(bestDay.reach)}
                </text>
              </g>
            )}
            {days.map((day, index) => (
              <g key={day.date}>
                {day.posts.length > 0 && (
                  <circle
                    cx={x(index)}
                    cy={baseline}
                    r={4}
                    fill={hover === index ? CHART_COLORS.now : '#fff'}
                    stroke={CHART_COLORS.now}
                    strokeWidth={2}
                  />
                )}
                {day.thenPosts.length > 0 && (
                  <circle
                    cx={x(index)}
                    cy={baseline + THEN_PIN_DROP}
                    r={3}
                    fill={hover === index ? CHART_COLORS.thenLine : '#fff'}
                    stroke={CHART_COLORS.thenLine}
                    strokeWidth={2}
                  />
                )}
              </g>
            ))}
          </svg>
          {hover !== null && hoveredDay && (
            <TrendTooltip
              day={hoveredDay}
              frac={x(hover) / W}
              labels={labels}
              networkLabel={networkLabel}
            />
          )}
        </div>
      </div>
    </ScrollToRecent>
  )
}

/**
 * One block per window, each under its OWN date. The two windows share an x-axis that can be
 * labelled only once, so a single-dated card ("13 Aug · Previous 3,948") reads as though the
 * comparison number described 13 Aug when it came from `day.thenDate`.
 */
function TrendTooltip({
  day,
  frac,
  labels,
  networkLabel,
}: {
  day: ReachDay
  frac: number
  labels: TrendLabels
  networkLabel: string
}) {
  return (
    <DayCard frac={frac}>
      <div className="flex items-center gap-1.5">
        <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-forest" />
        <span className="text-micro font-semibold text-ink">{formatDayMonth(day.date)}</span>
      </div>
      <dl className="mt-1.5 space-y-1">
        <DayCardRow label={labels.metricRow} value={day.now} />
        {day.views !== null && <DayCardRow label={labels.secondaryRow} value={day.views} />}
      </dl>
      <DayCardPosts posts={day.posts} divided={false} networkLabel={networkLabel} />

      <div className="mt-2.5 border-t border-ink/[0.05] pt-2">
        <div className="flex items-center gap-1.5">
          <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-metric-3" />
          <span className="text-micro font-semibold text-text2">
            {formatDayMonth(day.thenDate)}
            <span className="font-normal text-text3"> · previous period</span>
          </span>
        </div>
        <dl className="mt-1.5 space-y-1">
          <DayCardRow label={labels.metricRow} value={day.then} />
        </dl>
        <DayCardPosts
          posts={day.thenPosts}
          label="Published that day"
          divided={false}
          networkLabel={networkLabel}
        />
      </div>
    </DayCard>
  )
}

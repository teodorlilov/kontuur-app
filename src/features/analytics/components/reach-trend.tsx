'use client'

import { useState } from 'react'
import type { BestDay, ReachDay } from '../lib/build-report'
import { CHART_COLORS } from '../lib/chart-config'
import { formatCount, formatDayMonth } from '../lib/format'
import { lineSegments, niceCeil, segmentsToPath } from '../lib/svg-path'
import { DayCard, DayCardPosts, DayCardRow } from './day-card'
import { ScrollToRecent } from './scroll-to-recent'

const W = 1120
const H = 264
const PAD = { top: 16, right: 12, bottom: 30, left: 12 }

/**
 * The hero comparison: daily reach as two 2px lines — this period in Deep Pine
 * over an 8% wash, the previous period in the sage stroke — with the best day
 * marked by the Living Green now-dot, and every publish day pinned on the
 * baseline so a spike can be read against the post that caused it. Hovering
 * (or tapping) a day raises a crosshair and the day card: reach against the
 * previous period, that day's views, and the posts that went out. The now-line
 * draws in over the already-visible then-line (the page's one motion moment;
 * reduced-motion and print both get the finished state).
 */
export function ReachTrend({ days, bestDay }: { days: ReachDay[]; bestDay: BestDay | null }) {
  const [hover, setHover] = useState<number | null>(null)

  const nowValues = days.map((day) => day.now)
  const thenValues = days.map((day) => day.then)
  const real = [...nowValues, ...thenValues].filter((v): v is number => v !== null)
  if (real.length === 0 || days.length < 2) {
    return (
      <p className="mt-4 text-caption text-text3">
        No daily reach captured for this period yet — the nightly sync fills this in.
      </p>
    )
  }

  const max = niceCeil(Math.max(...real))
  const step = (W - PAD.left - PAD.right) / (days.length - 1)
  const x = (index: number): number => PAD.left + index * step
  const y = (value: number): number => PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom)
  const baseline = H - PAD.bottom

  const nowSegments = lineSegments(nowValues, x, y)
  const thenSegments = lineSegments(thenValues, x, y)

  // The wash under the now-line: the connected outline closed to the baseline.
  const nowPoints = nowSegments.flat()
  const washPath =
    nowPoints.length > 1
      ? `${nowPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${nowPoints[nowPoints.length - 1]!.x.toFixed(1)},${baseline} L${nowPoints[0]!.x.toFixed(1)},${baseline} Z`
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

  const spoken = `Line chart. Daily reach for this period against the previous one.${
    bestDay ? ` Peaks at ${formatCount(bestDay.reach)} on ${formatDayMonth(bestDay.date)}.` : ''
  }${
    publishDays > 0
      ? ` ${publishDays} publish day${publishDays === 1 ? ' is' : 's are'} pinned on the baseline — the posts table below lists every post.`
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
            {tickIndexes.map((index, position) => (
              <text
                key={index}
                x={x(index)}
                y={H - 8}
                textAnchor={
                  position === 0 ? 'start' : position === tickIndexes.length - 1 ? 'end' : 'middle'
                }
                fill={CHART_COLORS.label}
                className="text-micro"
              >
                {days[index] ? formatDayMonth(days[index].date) : ''}
              </text>
            ))}
            {washPath && <path d={washPath} fill={CHART_COLORS.now} opacity={0.06} />}
            <path
              d={segmentsToPath(thenSegments)}
              fill="none"
              stroke={CHART_COLORS.thenLine}
              strokeWidth={2}
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
            {days.map((day, index) =>
              day.posts.length > 0 ? (
                <circle
                  key={day.date}
                  cx={x(index)}
                  cy={baseline}
                  r={4}
                  fill={hover === index ? CHART_COLORS.now : '#fff'}
                  stroke={CHART_COLORS.now}
                  strokeWidth={2}
                />
              ) : null
            )}
          </svg>
          {hover !== null && hoveredDay && <TrendTooltip day={hoveredDay} frac={x(hover) / W} />}
        </div>
        <div
          className="mt-1.5 flex justify-between text-micro tabular-nums text-text3"
          aria-hidden="true"
        >
          <span>{formatDayMonth(days[0]!.date)}</span>
          <span>{formatDayMonth(days[days.length - 1]!.date)}</span>
        </div>
      </div>
    </ScrollToRecent>
  )
}

/** The reach day beside the crosshair: the pair, views, and the publications. */
function TrendTooltip({ day, frac }: { day: ReachDay; frac: number }) {
  return (
    <DayCard frac={frac}>
      <div className="text-micro font-semibold text-ink">{formatDayMonth(day.date)}</div>
      <dl className="mt-1.5 space-y-1">
        <DayCardRow swatch="bg-forest" label="Reach" value={day.now} />
        <DayCardRow swatch="bg-metric-3" label="Previous" value={day.then} />
        {day.views !== null && <DayCardRow label="Views" value={day.views} />}
      </dl>
      <DayCardPosts posts={day.posts} />
    </DayCard>
  )
}

'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import type { FollowerSummary } from '../lib/build-report'
import { CHART_COLORS } from '../lib/chart-config'
import { countDeltaVerdict } from '../lib/delta-verdict'
import { formatCount, formatDayMonth } from '../lib/format'
import { niceCeil } from '../lib/svg-path'
import { DayCard, DayCardPosts, DayCardRow } from './day-card'
import { DeltaChip } from './delta-chip'

const W = 560
const H = 208
const PAD = { top: 14, right: 8, bottom: 24, left: 8 }
/** Any nonzero day stays visible, even beside a spike. */
const MIN_BAR = 2.5

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatCount(Math.abs(value))}`
}

/**
 * The follower flow as a diverging daily timeline: gains rise from the
 * baseline in Deep Pine, losses hang below in Clay (the chips' desirability
 * vocabulary — direction separates them too, never color alone), and publish
 * days carry the same baseline pin the reach chart speaks. Both zones share
 * one px-per-follower scale, but each is sized to its own maximum, so a
 * quiet loss row never costs the gains half the height. Hovering (or
 * tapping) a day raises the shared day card: gained, lost, and the posts
 * that went out. A day the API never answered has no bars; a measured zero
 * is a flat day.
 */
export function FollowerFlow({ followers }: { followers: FollowerSummary }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = followers.byDay

  const gainCeil = niceCeil(Math.max(1, ...days.map((day) => day.gained ?? 0)))
  const lossMax = Math.max(0, ...days.map((day) => day.lost ?? 0))
  const lossCeil = lossMax > 0 ? niceCeil(lossMax) : 0
  const plotTop = PAD.top
  const plotBottom = H - PAD.bottom
  // One shared unit: a follower is the same number of pixels above and below.
  const unit = (plotBottom - plotTop) / (gainCeil + lossCeil)
  const baseY = plotTop + gainCeil * unit
  const lossZone = plotBottom - baseY
  const step = (W - PAD.left - PAD.right) / Math.max(days.length, 1)
  const barW = Math.min(14, Math.max(2, step * 0.62))
  const x = (index: number): number => PAD.left + index * step + step / 2
  const heightOf = (value: number): number => (value > 0 ? Math.max(value * unit, MIN_BAR) : 0)

  const locate = (event: React.PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const view = ((event.clientX - rect.left) / rect.width) * W
    const index = Math.floor((view - PAD.left) / step)
    setHover(Math.min(days.length - 1, Math.max(0, index)))
  }
  const hoveredDay = hover === null ? null : (days[hover] ?? null)

  const pinDays = days.filter((day) => day.posts.length > 0).length
  const spoken = `Diverging bars by day: follows gained rise above the baseline, losses hang below. Gained ${
    followers.gained.now === null ? 'unknown' : formatCount(followers.gained.now)
  } this period, lost ${
    followers.lost.now === null ? 'unknown' : formatCount(followers.lost.now)
  }.${pinDays > 0 ? ` ${pinDays} publish day${pinDays === 1 ? ' is' : 's are'} pinned under the timeline — the posts table below lists every post.` : ''} Days without data are gaps.`

  const metaParts = [
    followers.fromPosts !== null && followers.fromPosts > 0
      ? `Instagram credits ${formatCount(followers.fromPosts)} of these follows to your posts`
      : null,
    followers.churnPct !== null
      ? `${followers.churnPct < 10 ? followers.churnPct.toFixed(1) : Math.round(followers.churnPct)}% of the followers you started with left`
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="mt-3.5">
      <div className="flex flex-wrap gap-x-9 gap-y-3">
        <FlowStat
          swatch="bg-forest"
          label="Gained"
          now={followers.gained.now}
          then={followers.gained.then}
        />
        <FlowStat
          swatch="bg-danger"
          label="Lost"
          now={followers.lost.now}
          then={followers.lost.then}
          invert
        />
        <FlowStat label="Net" now={followers.net.now} then={followers.net.then} net />
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={spoken}
          className="mt-3 block h-auto w-full touch-none"
          onPointerMove={locate}
          onPointerDown={locate}
          onPointerLeave={() => setHover(null)}
        >
          {/* The scale frame: dashed ceilings for each zone, solid zero line. */}
          <line
            x1={PAD.left}
            y1={plotTop}
            x2={W - PAD.right}
            y2={plotTop}
            stroke={CHART_COLORS.grid}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={W - PAD.right}
            y={plotTop - 4}
            textAnchor="end"
            fill={CHART_COLORS.label}
            className="text-micro tabular-nums"
          >
            +{formatCount(gainCeil)}
          </text>
          {lossCeil > 0 && (
            <line
              x1={PAD.left}
              y1={plotBottom}
              x2={W - PAD.right}
              y2={plotBottom}
              stroke={CHART_COLORS.grid}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}
          {lossZone >= 24 && (
            <text
              x={W - PAD.right}
              y={plotBottom - 4}
              textAnchor="end"
              fill={CHART_COLORS.label}
              className="text-micro tabular-nums"
            >
              −{formatCount(lossCeil)}
            </text>
          )}
          {hover !== null && (
            <rect
              x={x(hover) - step / 2}
              y={plotTop}
              width={step}
              height={plotBottom - plotTop}
              fill={CHART_COLORS.ink}
              opacity={0.05}
              className="print:hidden"
              aria-hidden="true"
            />
          )}
          <line
            x1={PAD.left}
            y1={baseY}
            x2={W - PAD.right}
            y2={baseY}
            stroke={CHART_COLORS.grid}
            strokeWidth={1}
          />
          {days.map((day, index) => {
            const cx = x(index)
            return (
              <g key={day.date}>
                {day.gained !== null && day.gained > 0 && (
                  <rect
                    x={cx - barW / 2}
                    y={baseY - heightOf(day.gained)}
                    width={barW}
                    height={heightOf(day.gained)}
                    rx={2}
                    fill={CHART_COLORS.now}
                  />
                )}
                {day.lost !== null && day.lost > 0 && (
                  <rect
                    x={cx - barW / 2}
                    y={baseY}
                    width={barW}
                    height={heightOf(day.lost)}
                    rx={2}
                    fill={CHART_COLORS.loss}
                  />
                )}
                {day.posts.length > 0 && (
                  <circle
                    cx={cx}
                    cy={H - 9}
                    r={3.5}
                    fill={hover === index ? CHART_COLORS.now : '#fff'}
                    stroke={CHART_COLORS.now}
                    strokeWidth={2}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {hover !== null && hoveredDay && (
          <DayCard frac={x(hover) / W}>
            <div className="text-micro font-semibold text-ink">
              {formatDayMonth(hoveredDay.date)}
            </div>
            <dl className="mt-1.5 space-y-1">
              <DayCardRow
                swatch="bg-forest"
                label="Gained"
                value={hoveredDay.gained}
                format={(value) => `+${formatCount(value)}`}
              />
              <DayCardRow
                swatch="bg-danger"
                label="Lost"
                value={hoveredDay.lost}
                format={(value) => `−${formatCount(value)}`}
              />
            </dl>
            <DayCardPosts posts={hoveredDay.posts} />
          </DayCard>
        )}
      </div>
      {days.length > 0 && (
        <div
          className="mt-1 flex justify-between text-micro tabular-nums text-text3"
          aria-hidden="true"
        >
          <span>{formatDayMonth(days[0]!.date)}</span>
          <span>{formatDayMonth(days[days.length - 1]!.date)}</span>
        </div>
      )}
      {metaParts.length > 0 && (
        <p className="mt-2.5 text-caption text-text2">{metaParts.join(' · ')}.</p>
      )}
    </div>
  )
}

/**
 * One headline block: swatch-tied label on top, the number beside its noise-
 * banded chip, the previous period spelled out underneath. Net skips the chip
 * — its neighbours already carry the judgement — and prints signed.
 */
function FlowStat({
  swatch,
  label,
  now,
  then,
  invert = false,
  net = false,
}: {
  swatch?: string
  label: string
  now: number | null
  then: number | null
  invert?: boolean
  net?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {swatch && <i className={cn('h-2.5 w-1.5 rounded-[2px]', swatch)} aria-hidden="true" />}
        <span className="text-label text-text3">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-title tabular-nums text-ink">
          {now === null ? '—' : net ? signed(now) : formatCount(now)}
        </span>
        {!net && <DeltaChip verdict={countDeltaVerdict(now, then)} invert={invert} />}
      </div>
      {then !== null && (
        <p className="mt-0.5 text-micro tabular-nums text-text3">
          was {net ? signed(then) : formatCount(then)} last period
        </p>
      )}
    </div>
  )
}

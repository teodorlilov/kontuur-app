import type { FollowerSummary } from '../lib/build-report'
import { CHART_COLORS } from '../lib/chart-config'
import { countDeltaVerdict } from '../lib/delta-verdict'
import { formatCount, formatDayMonth } from '../lib/format'
import { niceCeil } from '../lib/svg-path'
import { DeltaChip } from './delta-chip'

const W = 560
const H = 190
const PAD = { top: 10, right: 8, bottom: 26, left: 8 }

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatCount(Math.abs(value))}`
}

/**
 * The follower flow as a diverging daily timeline: gains rise from the
 * midline in Deep Pine, losses hang below in Clay (the chips' desirability
 * vocabulary — direction separates them too, never color alone), and publish
 * days carry the same baseline pin the reach chart speaks. A day the API
 * never answered simply has no bars; a measured zero is a flat day.
 */
export function FollowerFlow({ followers }: { followers: FollowerSummary }) {
  const days = followers.byDay
  const maxVal = niceCeil(
    Math.max(1, ...days.map((day) => Math.max(day.gained ?? 0, day.lost ?? 0)))
  )
  const half = (H - PAD.top - PAD.bottom) / 2
  const baseY = PAD.top + half
  const step = (W - PAD.left - PAD.right) / Math.max(days.length, 1)
  const barW = Math.min(9, Math.max(2.5, step * 0.45))
  const x = (index: number): number => PAD.left + index * step + step / 2
  const heightOf = (value: number): number => (value / maxVal) * (half - 5)

  const pinDays = days.filter((day) => day.postCount > 0).length
  const spoken = `Diverging bars by day: follows gained rise above the midline, losses hang below. Gained ${
    followers.gained.now === null ? 'unknown' : formatCount(followers.gained.now)
  } this period, lost ${
    followers.lost.now === null ? 'unknown' : formatCount(followers.lost.now)
  }.${pinDays > 0 ? ` ${pinDays} publish day${pinDays === 1 ? ' is' : 's are'} pinned under the timeline.` : ''} Days without data are gaps.`

  const metaParts = [
    followers.net.now !== null ? `Net ${signed(followers.net.now)} this period` : null,
    followers.net.then !== null ? `${signed(followers.net.then)} last period` : null,
    followers.fromPosts !== null && followers.fromPosts > 0
      ? `${formatCount(followers.fromPosts)} follows attributed to posts by Instagram`
      : null,
    followers.churnPct !== null
      ? `${followers.churnPct < 10 ? followers.churnPct.toFixed(1) : Math.round(followers.churnPct)}% of starting followers left`
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="mt-3.5">
      <div className="flex flex-wrap gap-x-7 gap-y-2">
        <Stat label="Gained" now={followers.gained.now} then={followers.gained.then} />
        <Stat label="Lost" now={followers.lost.now} then={followers.lost.then} invert />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={spoken}
        className="mt-3 block h-auto w-full"
      >
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
                  rx={1.5}
                  fill={CHART_COLORS.now}
                />
              )}
              {day.lost !== null && day.lost > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={baseY}
                  width={barW}
                  height={heightOf(day.lost)}
                  rx={1.5}
                  fill={CHART_COLORS.loss}
                />
              )}
              {day.postCount > 0 && (
                <circle
                  cx={cx}
                  cy={H - 12}
                  r={3.5}
                  fill="#fff"
                  stroke={CHART_COLORS.now}
                  strokeWidth={2}
                />
              )}
              {/* Invisible hover column: the native tooltip names the day. */}
              <rect x={cx - step / 2} y={0} width={step} height={H} fill="transparent">
                <title>
                  {`${formatDayMonth(day.date)}: ${
                    day.gained === null ? 'gained unknown' : `+${formatCount(day.gained)} gained`
                  } · ${day.lost === null ? 'lost unknown' : `${formatCount(day.lost)} lost`}${
                    day.postCount > 0
                      ? ` · ${day.postCount} post${day.postCount === 1 ? '' : 's'} published`
                      : ''
                  }`}
                </title>
              </rect>
            </g>
          )
        })}
      </svg>
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

function Stat({
  label,
  now,
  then,
  invert = false,
}: {
  label: string
  now: number | null
  then: number | null
  invert?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-label text-text3">{label}</span>
      <span className="text-title tabular-nums text-ink">
        {now === null ? '—' : formatCount(now)}
      </span>
      <DeltaChip verdict={countDeltaVerdict(now, then)} invert={invert} />
      {then !== null && (
        <span className="text-micro tabular-nums text-text3">was {formatCount(then)}</span>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import type { AudienceOnline, PublishWindowBucket } from '../lib/build-report'
import { formatCount } from '../lib/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** A publish bucket may only editorialize from this many posts. */
const MIN_BUCKET_POSTS = 3
/** Below this the hour is treated as unmeasured, not as an empty hour. */
const NO_DATA = 0

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * Shading by RANK within the account's own week, not by share of the busiest
 * hour.
 *
 * A real account's hourly curve is a deep trough and a broad plateau: on the
 * probed account sixteen of twenty-four hours sat within 30% of each other
 * (median 261, peak 338), so `value / max` painted every one of them between
 * 0.78 and 1.0 opacity — a solid block with no readable pattern. Rank spends
 * the whole ramp on the variation that actually exists. The legend prints the
 * two endpoint counts so a flat week reads as flat (a narrow range), never as
 * manufactured drama.
 */
function rankShade(cells: number[]): (value: number) => number {
  const measured = cells.filter((value) => value > NO_DATA).sort((a, b) => a - b)
  if (measured.length < 2) return () => 0.5
  return (value) => {
    const first = measured.indexOf(value)
    const last = measured.lastIndexOf(value)
    if (first === -1) return 0
    return (first + last) / 2 / (measured.length - 1)
  }
}

interface HoverCell {
  weekday: number
  hour: number
}

/**
 * Two observed signals, side by side: when this account's followers are
 * online (Instagram's own hourly counts, averaged over the period and read in
 * the agency's clock) and what each publish window's posts actually earned
 * (medians, floored at three posts). Everything states its evidence — sampled
 * days, post counts — and neither signal ever renders from a thin sample.
 */
export function WhenToPost({
  online,
  windows,
}: {
  online: AudienceOnline | null
  windows: PublishWindowBucket[]
}) {
  const [hover, setHover] = useState<HoverCell | null>(null)
  const totalBucketed = windows.reduce((sum, bucket) => sum + bucket.postCount, 0)

  const cells = online ? online.grid.flat() : []
  const measured = cells.filter((value) => value > NO_DATA)
  const shadeOf = rankShade(cells)
  const quietest = measured.length > 0 ? Math.min(...measured) : 0
  const busiest = measured.length > 0 ? Math.max(...measured) : 0
  const average =
    measured.length > 0 ? measured.reduce((sum, value) => sum + value, 0) / measured.length : 0

  const spoken = online
    ? `Heat grid of followers online by weekday and hour, your local time, averaged over ${online.sampleDays} days. From about ${formatCount(quietest)} at the quietest hour to about ${formatCount(busiest)} at the busiest. Busiest: ${online.peaks
        .map((peak) => `${WEEKDAYS[peak.weekday]} ${hourLabel(peak.hour)}`)
        .join(', ')}.`
    : 'Followers-online data is still collecting.'

  const peakKeys = new Set(online?.peaks.map((peak) => `${peak.weekday}:${peak.hour}`) ?? [])
  const reading = hover ? (online?.grid[hover.weekday]?.[hover.hour] ?? null) : null

  return (
    <div className="mt-4 grid gap-7 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <div className="text-label text-text3">When your followers are online</div>
        {online === null ? (
          <p className="mt-3 max-w-[48ch] text-caption text-text3">
            Instagram serves these counts a day at a time — the hourly picture appears after about a
            week of nightly syncs.
          </p>
        ) : (
          <figure role="img" aria-label={spoken} className="mt-3">
            {/* The readout replaces a floating tooltip on purpose: it never
                covers the cells it describes, and it works on touch. */}
            <div aria-hidden="true" className="flex min-h-5 items-baseline gap-2 text-caption">
              {hover && reading !== null ? (
                <>
                  <span className="font-medium text-ink">
                    {WEEKDAYS_FULL[hover.weekday]} {hourLabel(hover.hour)}
                  </span>
                  <span className="text-text2">
                    {reading > NO_DATA
                      ? `~${formatCount(Math.round(reading))} followers online`
                      : 'not measured'}
                  </span>
                  {reading > NO_DATA && average > 0 && (
                    <span className="text-text3">{comparedToAverage(reading, average)}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-text3">Busiest</span>
                  <span className="font-medium text-ink">
                    {online.peaks
                      .map((peak) => `${WEEKDAYS[peak.weekday]} ${hourLabel(peak.hour)}`)
                      .join(' · ')}
                  </span>
                </>
              )}
            </div>
            <div
              aria-hidden="true"
              className="mt-2 grid gap-[3px]"
              onPointerLeave={() => setHover(null)}
            >
              {online.grid.map((row, weekday) => (
                <div key={WEEKDAYS[weekday]} className="flex items-center gap-2">
                  <span className="w-8 flex-none text-micro text-text3">{WEEKDAYS[weekday]}</span>
                  <div className="flex flex-1 gap-[2px]">
                    {row.map((avg, hour) => {
                      const isPeak = peakKeys.has(`${weekday}:${hour}`)
                      const isHover = hover?.weekday === weekday && hover.hour === hour
                      return (
                        <span
                          key={hour}
                          onPointerEnter={() => setHover({ weekday, hour })}
                          onPointerDown={() => setHover({ weekday, hour })}
                          className={cn(
                            'relative block h-5 flex-1 rounded-[3px]',
                            isHover && 'ring-2 ring-ink/40'
                          )}
                        >
                          <i
                            className="block h-full w-full rounded-[3px] bg-forest"
                            // Computed intensity — this cell's rank in the week.
                            style={{ opacity: avg > NO_DATA ? 0.08 + 0.92 * shadeOf(avg) : 0.04 }}
                          />
                          {isPeak && (
                            <i className="absolute inset-0 rounded-[3px] ring-2 ring-inset ring-spring" />
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="w-8 flex-none" />
                <div className="flex flex-1 justify-between text-micro tabular-nums text-text3">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
              </div>
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* The scale key: shading is relative to this account's own week,
                  so both ends carry their real count. */}
              <span aria-hidden="true" className="flex items-center gap-1.5">
                <span className="text-micro tabular-nums text-text3">~{formatCount(quietest)}</span>
                <span className="flex gap-[2px]">
                  {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                    <i
                      key={step}
                      className="block h-2.5 w-4 rounded-[2px] bg-forest"
                      style={{ opacity: 0.08 + 0.92 * step }}
                    />
                  ))}
                </span>
                <span className="text-micro tabular-nums text-text3">
                  ~{formatCount(busiest)} online
                </span>
              </span>
              <span className="text-micro text-text3">
                Your local time, averaged over {online.sampleDays} days · the ring marks the three
                busiest hours.
              </span>
            </figcaption>
          </figure>
        )}
      </div>
      <div>
        <div className="text-label text-text3">What each publish window earned</div>
        {totalBucketed === 0 ? (
          <p className="mt-3 text-caption text-text3">
            Appears once this period&rsquo;s posts have metrics.
          </p>
        ) : (
          <div className="mt-3 grid gap-2.5">
            {windows.map((bucket) => (
              <div key={bucket.key} className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-ink">{bucket.label}</span>
                <span className="text-right text-micro tabular-nums text-text2">
                  {bucket.postCount === 0 ? (
                    <span className="text-text3">no posts</span>
                  ) : bucket.postCount < MIN_BUCKET_POSTS || bucket.vsMedian === null ? (
                    <span className="text-text3">
                      only {bucket.postCount} post{bucket.postCount === 1 ? '' : 's'} — too few to
                      judge
                    </span>
                  ) : (
                    <>
                      <span className="font-medium text-ink">
                        {bucket.vsMedian.toFixed(1)}× your median reach
                      </span>{' '}
                      <span className="text-text3">
                        · {bucket.postCount} posts, median{' '}
                        {formatCount(Math.round(bucket.medianReach ?? 0))}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
            <p className="mt-1 max-w-[44ch] text-micro text-text3">
              The median reach of the posts you published in each window. Treat it as a hint rather
              than a rule — what you post moves these numbers more than when you post it.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** "18% above your weekly average" — the comparison the shading encodes. */
function comparedToAverage(value: number, average: number): string {
  const pct = Math.round(((value - average) / average) * 100)
  if (Math.abs(pct) < 3) return '· about your weekly average'
  return `· ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} your weekly average`
}

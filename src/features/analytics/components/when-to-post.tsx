import type { AudienceOnline, PublishWindowBucket } from '../lib/build-report'
import { formatCount } from '../lib/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** A publish bucket may only editorialize from this many posts. */
const MIN_BUCKET_POSTS = 3

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
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
  const gridMax = online ? Math.max(1, ...online.grid.flat()) : 1
  const totalBucketed = windows.reduce((sum, bucket) => sum + bucket.postCount, 0)

  const spoken = online
    ? `Heat grid of followers online by weekday and hour, your local time, averaged over ${online.sampleDays} days. Busiest: ${online.peaks
        .map((peak) => `${WEEKDAYS[peak.weekday]} ${hourLabel(peak.hour)}`)
        .join(', ')}.`
    : 'Followers-online data is still collecting.'

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
            <div aria-hidden="true" className="grid gap-[3px]">
              {online.grid.map((row, weekday) => (
                <div key={WEEKDAYS[weekday]} className="flex items-center gap-2">
                  <span className="w-8 flex-none text-micro text-text3">{WEEKDAYS[weekday]}</span>
                  <div className="flex flex-1 gap-[2px]">
                    {row.map((avg, hour) => (
                      <i
                        key={hour}
                        title={`${WEEKDAYS[weekday]} ${hourLabel(hour)} — ~${formatCount(Math.round(avg))} followers online`}
                        className="h-3.5 flex-1 rounded-[2px] bg-forest"
                        // Computed intensity — each cell's share of the busiest one.
                        style={{ opacity: avg > 0 ? 0.07 + 0.93 * (avg / gridMax) : 0.04 }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2" aria-hidden="true">
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
            <figcaption className="mt-2.5 text-caption text-text2">
              Busiest:{' '}
              <span className="font-medium text-ink">
                {online.peaks
                  .map((peak) => `${WEEKDAYS[peak.weekday]} ${hourLabel(peak.hour)}`)
                  .join(' · ')}
              </span>
              <span className="text-text3">
                {' '}
                — your local time, averaged over {online.sampleDays} days.
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
                      {bucket.postCount} post{bucket.postCount === 1 ? '' : 's'} — too few to read
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
              Medians of this period&rsquo;s posts by the hour they went out — a pattern so far, not
              a promise; content quality moves these more than timing does.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

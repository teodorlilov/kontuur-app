import type { AudienceReport, AudienceShare } from '../lib/build-report'

/**
 * The plot's height in pixels — the tallest column fills it exactly. It must
 * match the `h-36` well below: when the two disagreed (the whole chart, labels
 * included, was one h-36 box) the tallest column consumed every pixel and the
 * band labels overflowed onto the caption beneath them.
 */
const COLUMN_MAX_PX = 144

/**
 * Who follows against who actually engaged: paired columns by age band with
 * last period's follower share as a sage tick, then cities and gender as
 * labeled tracks with was-values. Followers wear Deep Pine, the engaged
 * audience Living Green — two series within ONE period, never "then".
 */
export function AudienceSection({ audience }: { audience: AudienceReport }) {
  const maxPct = Math.max(
    1,
    ...audience.ages.flatMap((band) => [band.followerPct, band.engagedPct ?? 0])
  )
  const px = (pct: number): number => (pct / maxPct) * COLUMN_MAX_PX

  const agesSpoken = audience.ages
    .map((band) => {
      const parts = [`${Math.round(band.followerPct)} percent following`]
      if (band.prevFollowerPct !== null) parts.push(`was ${Math.round(band.prevFollowerPct)}`)
      if (band.engagedPct !== null) parts.push(`${Math.round(band.engagedPct)} percent engaging`)
      if (band.engagedIndex !== null && (band.engagedIndex >= 1.25 || band.engagedIndex <= 0.75))
        parts.push(`engaging at ${band.engagedIndex.toFixed(1)} times its share`)
      return `${band.band}: ${parts.join(', ')}`
    })
    .join('. ')
  const anyIndexTag = audience.ages.some(
    (band) => band.engagedIndex !== null && (band.engagedIndex >= 1.25 || band.engagedIndex <= 0.75)
  )

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div
          role="img"
          aria-label={`Paired columns by age band, follower share against engaged share, with last period's follower share as a tick. ${agesSpoken}.`}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${audience.ages.length}, minmax(0, 1fr))` }}
        >
          {audience.ages.map((band) => (
            <div key={band.band} className="grid gap-2">
              {/* The plot well: a fixed height the columns rise in, with the
                  labels stacked BELOW it rather than sharing its box. */}
              <div className="flex h-36 items-end justify-center gap-1">
                <span className="relative flex h-full items-end">
                  <i
                    className="block w-4 rounded-t bg-forest"
                    // Computed heights/positions — shares of the tallest band.
                    style={{ height: `${px(band.followerPct).toFixed(0)}px` }}
                  />
                  {band.prevFollowerPct !== null && (
                    <b
                      className="absolute -left-0.5 h-0.5 w-5 rounded-full bg-then-line"
                      style={{ bottom: `${px(band.prevFollowerPct).toFixed(0)}px` }}
                    />
                  )}
                </span>
                {band.engagedPct !== null && (
                  <i
                    className="block w-4 rounded-t bg-spring"
                    style={{ height: `${px(band.engagedPct).toFixed(0)}px` }}
                  />
                )}
              </div>
              <div className="text-center text-micro tabular-nums text-text3">
                {band.band}
                {band.engagedIndex !== null &&
                  (band.engagedIndex >= 1.25 || band.engagedIndex <= 0.75) && (
                    <span
                      className={
                        band.engagedIndex >= 1.25
                          ? 'block font-medium text-forest'
                          : 'block text-text3'
                      }
                    >
                      {band.engagedIndex.toFixed(1)}×
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
        {anyIndexTag && (
          <p className="mt-2.5 text-micro text-text3">
            ×N marks bands engaging above or below their share of followers.
          </p>
        )}
      </div>
      <div>
        <PlaceList label="Top cities" shares={audience.cities} />
        {audience.countries.length > 0 && (
          <div className="mt-5">
            <PlaceList label="Top countries" shares={audience.countries} />
          </div>
        )}
        <div className="mt-5">
          <PlaceList label="Gender" shares={audience.genders} />
        </div>
      </div>
    </div>
  )
}

function PlaceList({ label, shares }: { label: string; shares: AudienceShare[] }) {
  if (shares.length === 0) return null
  const maxPct = Math.max(1, ...shares.map((share) => share.pct))
  return (
    <div>
      <div className="text-label text-text3">{label}</div>
      <div className="mt-2.5 grid gap-2">
        {shares.map((share) => (
          <div key={share.label} className="flex items-center gap-2.5 text-caption">
            <span className="w-20 flex-none truncate text-ink">{share.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <i
                className="block h-full rounded-full bg-forest"
                // Scaled so the largest share nearly fills its track.
                style={{ width: `${((share.pct / maxPct) * 88).toFixed(0)}%` }}
              />
            </span>
            <span className="w-9 flex-none text-right text-micro tabular-nums text-text2">
              {Math.round(share.pct)}%
            </span>
            <span className="w-14 flex-none text-right text-micro tabular-nums text-text3">
              {share.prevPct === null ? '' : `was ${Math.round(share.prevPct)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

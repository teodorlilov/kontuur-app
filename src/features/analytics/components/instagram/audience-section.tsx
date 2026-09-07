import { barWidthPct } from '../../lib/compute/bar-scale'
import type { AudienceReport, AudienceShare } from '../../lib/instagram/build-report'
import { formatSharePct } from '../../lib/compute/format'

/**
 * The tallest column fills the plot exactly, so this MUST stay equal to the `h-48` well
 * below it. If this grows past that height the columns overflow their box and land on the
 * band labels stacked underneath.
 */
const COLUMN_MAX_PX = 192

/** The place-list bars label in their own column, so they clear nothing. */
const BAR_SPAN_FULL_TRACK = 88

/**
 * Who follows against who actually engaged. Followers wear Deep Pine and the engaged audience
 * Living Green: two series within ONE period, never the now/then pair the rest of the
 * document uses. The previous snapshot's follower share appears as the then-line tick instead.
 *
 * The two halves centre against each other (`items-center`, not the `items-start` the document's
 * paired cards use): whichever is shorter would otherwise hang from the card's top edge with an
 * empty lower half under it.
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
    <div className="mt-4 grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div
          role="img"
          aria-label={`Paired columns by age band, follower share against engaged share, with last period's follower share as a tick. ${agesSpoken}.`}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${audience.ages.length}, minmax(0, 1fr))` }}
        >
          {audience.ages.map((band) => (
            <div key={band.band} className="grid gap-2">
              <div className="flex h-48 items-end justify-center gap-1.5">
                <span className="relative flex h-full items-end">
                  <i
                    className="block w-5 rounded-t bg-forest"
                    style={{ height: `${px(band.followerPct).toFixed(0)}px` }}
                  />
                  {band.prevFollowerPct !== null && (
                    <b
                      className="absolute -left-0.5 h-0.5 w-6 rounded-full bg-then-line"
                      style={{ bottom: `${px(band.prevFollowerPct).toFixed(0)}px` }}
                    />
                  )}
                </span>
                {band.engagedPct !== null && (
                  <i
                    className="block w-5 rounded-t bg-spring"
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
          <p className="mt-2.5 max-w-[52ch] text-micro text-text3">
            1.5× means a band produced half again the engagement its size predicts; 0.7× means it
            engages below its share. Bands under 5% of followers stay untagged.
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

/**
 * One share list — cities, countries or gender. The label sits in a fixed column so every bar
 * starts at the same x; the width is set for the longest country name `Intl.DisplayNames`
 * returns, and anything past it truncates.
 */
function PlaceList({ label, shares }: { label: string; shares: AudienceShare[] }) {
  if (shares.length === 0) return null
  const maxPct = Math.max(1, ...shares.map((share) => share.pct))
  return (
    <div>
      <div className="text-label text-text3">{label}</div>
      <div className="mt-2.5 grid gap-2">
        {shares.map((share) => (
          <div key={share.label} className="flex items-center gap-2.5 text-caption">
            <span className="w-28 flex-none truncate text-ink">{share.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <i
                className="block h-full rounded-full bg-forest"
                style={{
                  width: `${barWidthPct(share.pct, maxPct, BAR_SPAN_FULL_TRACK).toFixed(1)}%`,
                }}
              />
            </span>
            <span className="w-9 flex-none text-right text-micro tabular-nums text-text2">
              {formatSharePct(share.pct)}
            </span>
            <span className="w-14 flex-none text-right text-micro tabular-nums text-text3">
              {share.prevPct === null ? '' : `was ${formatSharePct(share.prevPct)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { CLIENT_COLORS } from '@/utils/constants'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

/**
 * The content mix, read back.
 *
 * Named rather than counted: a bar plus the words "4 pillars" showed the shape of the split while
 * hiding all four of the things the row exists to name. Hues come from `CLIENT_COLORS`, which
 * DESIGN.md sanctions for "which content pillar this is" — the same array `PillarEditor` uses, so
 * a pillar keeps its colour between the read view and the editor.
 *
 * Shared rather than onboarding's own: the brand re-read's comparison shows two of these side by
 * side, and a set of pillars run together into one sentence is unreadable at four pillars — which
 * is the whole reason this component exists.
 */
export function MixRead({ pillars }: { pillars: readonly WeightedPillar[] }) {
  if (pillars.length === 0) return <span className="text-ink">—</span>

  const total = pillars.reduce((sum, pillar) => sum + pillar.weight, 0)

  return (
    <div className="w-full">
      <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-sunken">
        {pillars.map((pillar, index) => (
          <span
            key={pillar.id}
            // Computed share and hue — the one inline style DESIGN.md allows.
            style={{
              width: `${(pillar.weight / Math.max(total, 1)) * 100}%`,
              background: CLIENT_COLORS[index % CLIENT_COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-2 grid gap-1">
        {pillars.map((pillar, index) => (
          <li
            key={pillar.id}
            className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-2 text-caption"
          >
            {/* mt-1 centres the 8px dot on the first line of a 12px/1.4 row, which `items-center`
                stopped doing the moment a name was allowed to wrap onto a second line. */}
            <span
              aria-hidden
              className="mt-1 size-2 rounded-xs"
              style={{ background: CLIENT_COLORS[index % CLIENT_COLORS.length] }}
            />
            {/* Wraps rather than truncates: these names are model-written and routinely run past
                any column this fits in, and a component whose whole job is naming the four pillars
                must not be the thing that hides their names. */}
            <span className="text-text2">{pillar.pillar || 'Unnamed pillar'}</span>
            <b className="font-semibold tabular-nums tracking-tight text-ink">{pillar.weight}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

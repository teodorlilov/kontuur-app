'use client'

import { PillarEditor } from '@/components/ui/pillar-editor'
import { CLIENT_COLORS } from '@/utils/constants'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

/**
 * The content mix, read back.
 *
 * Named rather than counted: a bar plus the words "4 pillars" showed the shape of the split while
 * hiding all four of the things the row exists to name. Hues come from `CLIENT_COLORS`, which
 * DESIGN.md sanctions for "which content pillar this is" — the same array `PillarEditor` uses, so
 * a pillar keeps its colour between the read view and the editor.
 */
export function MixRead({ pillars }: { pillars: WeightedPillar[] }) {
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
            className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 text-caption"
          >
            <span
              aria-hidden
              className="size-2 rounded-xs"
              style={{ background: CLIENT_COLORS[index % CLIENT_COLORS.length] }}
            />
            <span className="truncate text-text2">{pillar.pillar || 'Unnamed pillar'}</span>
            <b className="font-semibold tabular-nums tracking-tight text-ink">{pillar.weight}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Editing the mix is `PillarEditor` unchanged — it already carries add, remove, largest-remainder
 * rebalancing and a total check, none of which a second implementation would get right for free.
 */
export function MixEdit({
  pillars,
  onChange,
}: {
  pillars: WeightedPillar[]
  onChange: (pillars: WeightedPillar[]) => void
}) {
  return <PillarEditor pillars={pillars} onChange={onChange} allowEmpty />
}

'use client'

import { PillarEditor } from '@/components/ui/pillar-editor'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

/**
 * Editing the mix is `PillarEditor` unchanged — it already carries add, remove, largest-remainder
 * rebalancing and a total check, none of which a second implementation would get right for free.
 *
 * The read view moved to `components/ui/pillar-mix.tsx` when the brand re-read became its second
 * consumer; this file keeps only the part that is genuinely onboarding's.
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

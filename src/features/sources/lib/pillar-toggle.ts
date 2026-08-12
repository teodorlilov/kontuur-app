import { resolveEffectivePillarIds, type WeightedPillar } from '@/lib/clients/content-pillars'

/**
 * The next pillar_ids after clicking one pillar's chip on a source card.
 *
 * Empty means feeds-all (the DB rule), and the two boundary clicks keep that
 * state honest rather than hidden: emptying the set snaps back to feeds-all —
 * a source cannot feed nothing — and completing the set collapses to [] so an
 * explicitly-full source still follows pillars added later, which is what the
 * "including ones you add later" caption promises.
 */
export function togglePillarAssignment(
  currentPillarIds: unknown,
  clickedId: string,
  pillars: WeightedPillar[]
): string[] {
  const allIds = pillars.map((p) => p.id)
  const effective = resolveEffectivePillarIds(currentPillarIds, pillars)

  if (effective.length === 0) {
    return allIds.filter((id) => id !== clickedId)
  }
  const next = effective.includes(clickedId)
    ? effective.filter((id) => id !== clickedId)
    : [...effective, clickedId]

  return next.length === 0 || next.length === allIds.length ? [] : next
}

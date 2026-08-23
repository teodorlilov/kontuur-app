import { pluralise } from '@/utils/format'

/**
 * What replacing the pillar set costs the sources scoped to the old one.
 *
 * The counterpart to `describeNewPillarCoverage` below, which only ever covered the other
 * direction. A source whose every pillar is deleted has its `pillar_ids` emptied on save — and an
 * empty list means *feeds every pillar*, not none. Deleting one pillar by hand makes that visible;
 * replacing all four from a website read does it to every scoped source at once, from one click,
 * which is the case that needs saying out loud.
 *
 * Returns null when no source loses its scoping, so the row stays quiet in the common case.
 */
export function describeClearedPillarScoping(
  restrictedSourcePillarIds: ReadonlyArray<readonly string[]>,
  nextPillarIds: readonly string[]
): string | null {
  const surviving = new Set(nextPillarIds)
  const released = restrictedSourcePillarIds.filter(
    (ids) => !ids.some((id) => surviving.has(id))
  ).length
  if (released === 0) return null

  return `${pluralise(released, 'source')} scoped to the pillars this replaces will go back to feeding every pillar.`
}

/**
 * The caption shown while the pillar editor holds pillars the profile has not
 * saved yet: unrestricted sources feed every pillar — including these new ones —
 * and that rule is otherwise invisible until a run surprises someone.
 * Returns null when there is nothing to say.
 */
export function describeNewPillarCoverage(
  savedPillarNames: readonly string[],
  draftPillars: ReadonlyArray<{ pillar: string }>,
  unrestrictedSourceCount: number
): string | null {
  if (unrestrictedSourceCount === 0) return null

  const saved = new Set(savedPillarNames.map((n) => n.trim().toLowerCase()))
  const added = draftPillars
    .map((p) => p.pillar.trim())
    .filter((name) => name.length > 0 && !saved.has(name.toLowerCase()))
  if (added.length === 0) return null

  const names = added.map((n) => `“${n}”`).join(', ')
  return `${unrestrictedSourceCount} source${
    unrestrictedSourceCount === 1 ? '' : 's'
  } with no topic limit will also feed ${names}.`
}

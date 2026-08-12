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

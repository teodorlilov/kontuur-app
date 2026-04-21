export interface WeightedPillar {
  id: string
  pillar: string
  weight: number
}

/**
 * Parse content_pillars JSON string into WeightedPillar[].
 * Returns [] if null/empty/invalid.
 * Assigns a stable UUID to any pillar missing an id (legacy data or LLM output).
 */
export function parsePillars(raw: string | null): WeightedPillar[] {
  return parsePillarsWithMeta(raw).pillars
}

/**
 * Like parsePillars but also reports whether any IDs were generated.
 * Use this when you need to persist the generated IDs back to the DB.
 */
export function parsePillarsWithMeta(raw: string | null): {
  pillars: WeightedPillar[]
  hadMissingIds: boolean
} {
  if (!raw?.trim()) return { pillars: [], hadMissingIds: false }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { pillars: [], hadMissingIds: false }
    let hadMissingIds = false
    const pillars = parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).pillar === 'string' &&
          typeof (item as Record<string, unknown>).weight === 'number'
      )
      .map((item) => {
        const hasId = typeof item.id === 'string' && item.id.length > 0
        if (!hasId) hadMissingIds = true
        return {
          id: hasId ? (item.id as string) : crypto.randomUUID(),
          pillar: item.pillar as string,
          weight: item.weight as number,
        }
      })
    return { pillars, hadMissingIds }
  } catch {
    return { pillars: [], hadMissingIds: false }
  }
}

/**
 * Serialize weighted pillars to a JSON string for DB storage.
 */
export function serializePillars(pillars: WeightedPillar[]): string {
  return JSON.stringify(pillars)
}

/**
 * Redistribute weights equally across all pillars.
 * Handles rounding so total is exactly 100.
 */
export function equalizeWeights(pillars: WeightedPillar[]): WeightedPillar[] {
  if (pillars.length === 0) return []
  const base = Math.floor(100 / pillars.length)
  const remainder = 100 - base * pillars.length
  return pillars.map((p, i) => ({
    id: p.id,
    pillar: p.pillar,
    weight: base + (i < remainder ? 1 : 0),
  }))
}

/**
 * Allocate N items proportionally by pillar weight.
 * Ensures at least 1 allocation for any pillar with weight > 0 when total allows.
 * Returns a Map<pillarName, count>.
 */
export function allocateByWeight(pillars: WeightedPillar[], total: number): Map<string, number> {
  const result = new Map<string, number>()
  if (pillars.length === 0 || total <= 0) return result

  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0)
  if (totalWeight <= 0) {
    // All zero weights — distribute evenly
    const each = Math.floor(total / pillars.length)
    const rem = total - each * pillars.length
    pillars.forEach((p, i) => result.set(p.pillar, each + (i < rem ? 1 : 0)))
    return result
  }

  // Proportional allocation with largest-remainder rounding
  const rawAllocs = pillars.map((p) => ({
    pillar: p.pillar,
    exact: (p.weight / totalWeight) * total,
  }))

  const floored = rawAllocs.map((a) => Math.floor(a.exact))
  let remaining = total - floored.reduce((s, v) => s + v, 0)

  // Sort by fractional remainder (descending) to assign extras
  const indices = rawAllocs
    .map((a, i) => ({ i, frac: a.exact - floored[i]! }))
    .sort((a, b) => b.frac - a.frac)

  for (const { i } of indices) {
    if (remaining <= 0) break
    floored[i]!++
    remaining--
  }

  pillars.forEach((p, i) => result.set(p.pillar, floored[i]!))
  return result
}

/** Extract pillar IDs from a source's pillar_ids column. Empty array = feeds all pillars. */
export function getSourcePillarIds(pillarIds: unknown): string[] {
  if (!Array.isArray(pillarIds)) return []
  return pillarIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** Resolve pillar IDs to pillar names. Returns [] if ids is empty (= all pillars). */
export function resolvePillarNames(ids: string[], pillars: WeightedPillar[]): string[] {
  if (ids.length === 0) return []
  const idSet = new Set(ids)
  return pillars.filter((p) => idSet.has(p.id)).map((p) => p.pillar)
}

/** Check if a pillar has at least one eligible source (any source with empty pillar_ids or containing this pillar's id). */
export function pillarHasSources(pillarId: string, allSourcePillarIds: string[][]): boolean {
  return allSourcePillarIds.some(
    (ids) => ids.length === 0 || ids.includes(pillarId)
  )
}

export interface WeightedPillar {
  pillar: string
  weight: number
}

/**
 * Parse content_pillars JSON string into WeightedPillar[].
 * Returns [] if null/empty/invalid.
 */
export function parsePillars(raw: string | null): WeightedPillar[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is WeightedPillar =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).pillar === 'string' &&
        typeof (item as Record<string, unknown>).weight === 'number'
    )
  } catch {
    return []
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

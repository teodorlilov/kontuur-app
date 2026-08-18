export interface WeightedPillar {
  id: string
  pillar: string
  weight: number
}

/** Whether an item already carries a usable id. The one definition of "has an id". */
function hasPillarId(item: { id?: unknown }): boolean {
  return typeof item.id === 'string' && item.id.length > 0
}

/**
 * Stamps a stable id onto any pillar missing one.
 *
 * Both the generator and legacy rows produce `{ pillar, weight }` with no id, and the editor keys
 * its rows by id — so ids must be assigned where that data enters the app, not when it is saved.
 * Assigning them late leaves every row keyed `undefined` for the whole editing session.
 */
export function ensurePillarIds(
  items: ReadonlyArray<{ id?: string; pillar: string; weight: number }>
): WeightedPillar[] {
  return items.map((item) => ({
    id: hasPillarId(item) ? item.id! : crypto.randomUUID(),
    pillar: item.pillar,
    weight: item.weight,
  }))
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

    const valid = parsed.filter(
      (item): item is { id?: string; pillar: string; weight: number } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).pillar === 'string' &&
        typeof (item as Record<string, unknown>).weight === 'number'
    )

    return { pillars: ensurePillarIds(valid), hadMissingIds: valid.some((i) => !hasPillarId(i)) }
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
 *
 * When `recentPillarCounts` is provided (counts of the client's recent posts
 * per pillar), the marginal items go to the most UNDER-SERVED pillars instead
 * of always the heaviest — so small batches rotate through pillars over time
 * rather than permanently starving low-weight ones. Without it, behavior is
 * identical to the memoryless largest-remainder allocation.
 */
export function allocateByWeight(
  pillars: WeightedPillar[],
  total: number,
  recentPillarCounts?: Map<string, number>
): Map<string, number> {
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

  // Assign extras by history deficit when available (weight share of recent
  // posts minus actual recent posts — most under-served first), otherwise by
  // fractional remainder
  const recentTotal = recentPillarCounts
    ? [...recentPillarCounts.values()].reduce((s, v) => s + v, 0)
    : 0
  const rank =
    recentPillarCounts && recentTotal > 0
      ? pillars.map((p, i) => ({
          i,
          key: (p.weight / totalWeight) * recentTotal - (recentPillarCounts.get(p.pillar) ?? 0),
        }))
      : rawAllocs.map((a, i) => ({ i, key: a.exact - floored[i]! }))

  const indices = rank.sort((a, b) => b.key - a.key)

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

/**
 * Resolve a source's pillar_ids to the ids that exist on the client today.
 * Ids referencing deleted pillars degrade to [] = feeds-all: sync-source-pillars
 * already rewrites the column to [] once the last assigned pillar dies, and the
 * sources UI displays that state as "All pillars" — a stale set must behave like
 * the [] it is about to become, not silently starve the source.
 */
export function resolveEffectivePillarIds(pillarIds: unknown, pillars: WeightedPillar[]): string[] {
  const ids = getSourcePillarIds(pillarIds)
  if (ids.length === 0) return []
  const known = new Set(pillars.map((p) => p.id))
  const effective = ids.filter((id) => known.has(id))
  return effective.length === 0 ? [] : effective
}

/**
 * How a pillar can be served, in descending confidence: deterministic source
 * material ('content'), a web search that may or may not land ('web'), or
 * nothing at all ('none' — the run skips it).
 */
export type PillarCoverageState = 'content' | 'web' | 'none'

interface PillarCoverage {
  state: PillarCoverageState
  /** Labels of the non-tavily sources that feed this pillar, in source order. */
  contentSourceLabels: string[]
}

/** The three fields coverage needs — structural, so every source row shape qualifies. */
interface CoverageSource {
  type: string
  label: string
  pillar_ids: unknown
}

/**
 * The one definition of pillar coverage, shared by the generate run panel, the
 * sources page, and the research pre-skip — three surfaces that previously each
 * computed their own (and disagreed on whether the tavily source counts).
 * Callers pass ACTIVE sources only. A source feeds a pillar when its effective
 * pillar_ids are empty (= all pillars) or contain the pillar's id; the tavily
 * row grants only 'web' — search may find nothing, so it is never 'content'.
 */
export function computePillarCoverage(
  pillars: WeightedPillar[],
  sources: readonly CoverageSource[]
): Map<string, PillarCoverage> {
  const contentSources = sources
    .filter((s) => s.type !== 'tavily')
    .map((s) => ({ label: s.label, ids: resolveEffectivePillarIds(s.pillar_ids, pillars) }))
  const tavilyRow = sources.find((s) => s.type === 'tavily')
  const tavilyIds = tavilyRow ? resolveEffectivePillarIds(tavilyRow.pillar_ids, pillars) : null

  const feeds = (ids: string[], pillarId: string) => ids.length === 0 || ids.includes(pillarId)

  const coverage = new Map<string, PillarCoverage>()
  for (const pillar of pillars) {
    const labels = contentSources.filter((s) => feeds(s.ids, pillar.id)).map((s) => s.label)
    const state: PillarCoverageState =
      labels.length > 0
        ? 'content'
        : tavilyIds !== null && feeds(tavilyIds, pillar.id)
          ? 'web'
          : 'none'
    coverage.set(pillar.id, { state, contentSourceLabels: labels })
  }
  return coverage
}

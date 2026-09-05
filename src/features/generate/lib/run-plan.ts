import {
  allocateByWeight,
  computePillarCoverage,
  type PillarCoverageState,
  type WeightedPillar,
} from '@/lib/clients/content-pillars'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { toPublishingPlatform } from '@/lib/validation'
import type { ClientSourceSummary } from '@/lib/queries/db'
import type { MetaConnection } from '@/types/api'

/** One pillar's slice of the upcoming run, as the run panel previews it. */
export interface PillarAllocation {
  pillar: WeightedPillar
  /** Posts this run would ask for on this pillar (memoryless split). */
  count: number
  /** How the pillar can be served: source material, web search only, or nothing. */
  coverage: PillarCoverageState
}

/**
 * Whether this client's drafts have anywhere to go.
 *
 * It had a third state, `manual`: Kontuur wrote for LinkedIn and TikTok but published to
 * neither, so a run aimed at one produced copy to paste out by hand. A run is not aimed at
 * a network any more — copy is written once and its destinations are resolved when it is
 * scheduled — so the only question left is whether the client has a live connection.
 */
export type PublishState =
  /** This client has at least one connection with a working token. */
  | { kind: 'connected' }
  /** No working connection — drafts still generate, they just cannot go out. */
  | { kind: 'not_connected' }

export interface RunPlan {
  allocation: PillarAllocation[]
  /** Names of pillars nothing feeds — the run pre-skips them. */
  starvedPillars: string[]
  /** Names of pillars only web research can serve — kept, but may not land. */
  webOnlyPillars: string[]
  /** An active tavily source means the run searches the web. */
  webResearchActive: boolean
  publishState: PublishState
}

interface ComputeRunPlanInput {
  pillars: WeightedPillar[]
  targetPostCount: number
  sources: ClientSourceSummary[]
  connections: MetaConnection[]
}

/**
 * Previews what a generation run will produce, from the same inputs the
 * research orchestrator reads — so the panel's claim matches the run's
 * behaviour. Allocation uses the memoryless allocateByWeight branch: the
 * history nudge is server-side and a client preview cannot honestly apply it.
 */
export function computeRunPlan({
  pillars,
  targetPostCount,
  sources,
  connections,
}: ComputeRunPlanInput): RunPlan {
  const webResearchActive = sources.some((s) => s.type === 'tavily')
  const coverage = computePillarCoverage(pillars, sources)

  // Mirror the orchestrator: the run's count is spread over pillars research
  // can serve — a pre-skipped pillar costs coverage, not posts. Allocating over
  // all pillars painted a count onto rows annotated "skipped", which read as
  // the preview contradicting itself.
  const servablePillars = pillars.filter((p) => coverage.get(p.id)?.state !== 'none')
  const counts = allocateByWeight(servablePillars, targetPostCount)
  const allocation: PillarAllocation[] = pillars.map((pillar) => ({
    pillar,
    count: counts.get(pillar.pillar) ?? 0,
    coverage: coverage.get(pillar.id)?.state ?? 'none',
  }))

  const starvedPillars = allocation.filter((a) => a.coverage === 'none').map((a) => a.pillar.pillar)
  const webOnlyPillars = allocation.filter((a) => a.coverage === 'web').map((a) => a.pillar.pillar)

  return {
    allocation,
    starvedPillars,
    webOnlyPillars,
    webResearchActive,
    publishState: computePublishState(connections),
  }
}

/**
 * Which of the client's connections can take THIS post is the adapters' business, and they
 * are server-side. This preview claims only what it can see from the browser: a publishing
 * connection with a live token. Canva rows share the table and are not one.
 */
function computePublishState(connections: MetaConnection[]): PublishState {
  const working = connections.some(
    (c) => toPublishingPlatform(c.platform) && !isTokenExpired(c.token_expires_at)
  )
  return working ? { kind: 'connected' } : { kind: 'not_connected' }
}

/**
 * How many posts the skipped pillars actually cost this run. Pre-skipped
 * pillars allocate 0 by construction — the run redistributes their share — so
 * only post-research skips (a fed pillar research came back empty for)
 * contribute, and the review banner's copy must not claim the run came back
 * short when it did not.
 */
export function allocationCostOfSkips(
  allocation: PillarAllocation[],
  skippedNames: string[]
): number {
  const skipped = new Set(skippedNames)
  return allocation.reduce((sum, a) => (skipped.has(a.pillar.pillar) ? sum + a.count : sum), 0)
}

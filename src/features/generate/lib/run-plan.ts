import {
  allocateByWeight,
  computePillarCoverage,
  type PillarCoverageState,
  type WeightedPillar,
} from '@/lib/clients/content-pillars'
import { isConnectionRetired, isTokenExpired } from '@/lib/meta/token-expiry'
import { toPublishingPlatform } from '@/lib/meta/platforms'
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
 * The networks the browser can see a live connection for: a publishing connection with a live
 * token, neither lapsed nor retired. Canva rows share the table and are not one. Which of them
 * can take THIS post is the adapters' business (`capableDestinations`), and the server intersects
 * again before anything publishes — this is the client-side half every reader shares.
 */
export function livePublishingPlatforms(connections: MetaConnection[]): string[] {
  return connections.flatMap((c) => {
    const platform = toPublishingPlatform(c.platform)
    return platform && !isConnectionRetired(c) && !isTokenExpired(c.token_expires_at)
      ? [platform]
      : []
  })
}

function computePublishState(connections: MetaConnection[]): PublishState {
  return livePublishingPlatforms(connections).length > 0
    ? { kind: 'connected' }
    : { kind: 'not_connected' }
}

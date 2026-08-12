import {
  allocateByWeight,
  computePillarCoverage,
  type PillarCoverageState,
  type WeightedPillar,
} from '@/lib/clients/content-pillars'
import { LIVE_PLATFORMS } from '@/utils/constants'
import { isTokenExpired } from '@/lib/meta/token-expiry'
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

/** How publishing will behave for the chosen platform. */
export type PublishState =
  /** Platform is live and this client has a working connection. */
  | { kind: 'connected' }
  /** Platform is live but the client has no working connection — drafts still generate. */
  | { kind: 'not_connected' }
  /** Kontuur writes for this platform but does not publish there — copy out by hand. */
  | { kind: 'manual' }

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
  platform: string
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
  platform,
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
    publishState: computePublishState(platform, connections),
  }
}

/** Platform names ('Instagram') vs connection rows ('instagram') differ only by case. */
function connectionMatchesPlatform(connection: MetaConnection, platform: string): boolean {
  return connection.platform.toLowerCase() === platform.toLowerCase()
}

function computePublishState(platform: string, connections: MetaConnection[]): PublishState {
  if (!LIVE_PLATFORMS.has(platform)) return { kind: 'manual' }
  const working = connections.some(
    (c) => connectionMatchesPlatform(c, platform) && !isTokenExpired(c.token_expires_at)
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

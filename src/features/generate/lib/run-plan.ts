import {
  allocateByWeight,
  getSourcePillarIds,
  pillarHasSources,
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
  /** Whether at least one active source feeds this pillar. */
  hasSources: boolean
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
  /** Names of pillars with no sources of their own. */
  starvedPillars: string[]
  /** An active tavily source means web research can serve any pillar. */
  webResearchActive: boolean
  /**
   * What happens to starved pillars: 'soft' — web research may still serve
   * them; 'hard' — they are pre-skipped before research; null — nothing is
   * starved. Mirrors research-orchestrator.ts's pre-skip rule.
   */
  skipMode: 'soft' | 'hard' | null
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
  const contentSourcePillarIds = sources
    .filter((s) => s.type !== 'tavily')
    .map((s) => getSourcePillarIds(s.pillar_ids))

  const counts = allocateByWeight(pillars, targetPostCount)
  const allocation: PillarAllocation[] = pillars.map((pillar) => ({
    pillar,
    count: counts.get(pillar.pillar) ?? 0,
    hasSources: pillarHasSources(pillar.id, contentSourcePillarIds),
  }))

  const starvedPillars = allocation.filter((a) => !a.hasSources).map((a) => a.pillar.pillar)
  const skipMode = starvedPillars.length === 0 ? null : webResearchActive ? 'soft' : 'hard'

  return {
    allocation,
    starvedPillars,
    webResearchActive,
    skipMode,
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
 * How many posts the skipped pillars actually cost this run — the same sum
 * research-orchestrator.ts reports as skippedCount. A pillar allocated nothing
 * cost nothing, and the review banner's copy must not claim otherwise.
 */
export function allocationCostOfSkips(
  allocation: PillarAllocation[],
  skippedNames: string[]
): number {
  const skipped = new Set(skippedNames)
  return allocation.reduce((sum, a) => (skipped.has(a.pillar.pillar) ? sum + a.count : sum), 0)
}

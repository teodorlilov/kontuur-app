import { notFound, redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgency, getCachedAgencyClients, getCachedEntitlement } from '@/lib/queries/cache'
import { readUsage } from '@/lib/billing/usage'
import { generationGate } from '@/lib/billing/post-allowance'
import { NOTHING_OWED } from '@/lib/billing/copy'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchOwedImages, owedImagesOf, sumOwed } from '@/lib/visual/owed-images'
import {
  fetchClientSourceSummaries,
  fetchConnectionsByClient,
  type ClientSourceSummary,
} from '@/lib/queries/db'
import { buildClientData, fetchClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { DEFAULT_RUN_SIZE } from '@/utils/constants'
import { fetchIdeaById } from '@/features/ideas/lib/ideas'
import { AWAITING_DECISION } from '@/features/ideas/lib/idea-filters'
import { GenerateFlow } from '@/features/generate/components/generate-flow'
import { groupWaitingDrafts, type WaitingDrafts } from '@/features/generate/lib/waiting-drafts'
import { requireBusinessSetup } from '@/features/onboarding/lib/require-business-setup'
import { fetchEditorialPosts } from '@/lib/posts/fetch-editorial-posts'
import { fetchWaitingRuns } from '@/lib/generation/runs'
import type { MetaConnection } from '@/types/api'

interface PageProps {
  searchParams: Promise<{ ideaId?: string; client?: string }>
}

/**
 * The generate wizard, preloaded for the idea's client, the agency's `?client=`, or the first.
 * This route group has no shell (src/app/(generate)/layout.tsx), so the page repeats the layout's
 * first-run gate (`requireBusinessSetup`) and hands down the agency's zone, in which scheduled
 * times resolve rather than in the browser's. An `?ideaId=` is honoured or refused, never dropped
 * for a plain run, and keys `GenerateFlow`: Next keeps client state across a search-params-only
 * navigation (node_modules/next/dist/client/components/layout-router.js), and New run on an idea
 * moves to the client's plain `/generate`. It hands down both pools, not a post count, because
 * what they buy depends on the format chosen in the browser (`postsAffordable`). Owed pictures
 * that could not be read reach `generationGate` as unknown (null), never zero; a failed drafts
 * read shows nothing waiting rather than hiding the wizard behind its own resume.
 */
export default async function GeneratePage({ searchParams }: PageProps) {
  const [{ agencyId }, { ideaId, client }] = await Promise.all([requireSessionUser(), searchParams])
  const supabase = await createServerSupabaseClient()

  const [clients, initialIdea, agency, entitlement] = await Promise.all([
    getCachedAgencyClients(agencyId),
    ideaId ? fetchIdeaById(ideaId, agencyId) : null,
    getCachedAgency(agencyId),
    getCachedEntitlement(agencyId),
  ])
  const clientIds = clients.map((c) => c.id)
  const [usage, drafts, reviewOwed] = await Promise.all([
    readUsage(agencyId, entitlement.periodKey),
    fetchEditorialPosts(supabase, clientIds, 'draft')
      .then(async (posts) => {
        const runIds = [...new Set(posts.flatMap((item) => item.post.generation_run_id ?? []))]
        return {
          posts,
          groups: groupWaitingDrafts(posts, await fetchWaitingRuns(supabase, runIds)),
        }
      })
      .catch((err: unknown) => {
        console.error('[generate] waiting drafts read failed:', err)
        return null
      }),
    fetchOwedImages(createAdminSupabaseClient(), clientIds, ['pending_review']).catch(
      (err: unknown) => {
        console.error('[generate] owed images read failed:', err)
        return null
      }
    ),
  ])
  const waitingDrafts: WaitingDrafts[] = drafts?.groups ?? []
  const owed = drafts && reviewOwed ? sumOwed([owedImagesOf(drafts.posts), reviewOwed]) : null
  requireBusinessSetup(agency?.mode, clients.length, entitlement.canCreate)

  if (ideaId && !initialIdea) notFound()

  if (initialIdea && !AWAITING_DECISION.includes(initialIdea.status)) {
    redirect(`/ideas?tab=${initialIdea.status === 'generated' ? 'generated' : 'dismissed'}`)
  }

  let initialClientData: ClientData | null = null
  let initialTargetPostCount: number = DEFAULT_RUN_SIZE
  let initialSources: ClientSourceSummary[] = []
  let initialConnections: MetaConnection[] = []

  const requestedClientId = client && clients.some((c) => c.id === client) ? client : undefined
  const targetClientId = initialIdea?.clientId ?? requestedClientId ?? clients[0]?.id
  if (targetClientId) {
    const targetClient = clients.find((c) => c.id === targetClientId)
    if (targetClient && targetClient.posts_per_week > 0) {
      initialTargetPostCount = targetClient.posts_per_week
    }
    const [result, sources, connections] = await Promise.all([
      targetClient
        ? buildClientData(supabase, targetClient).then((data) => ({ data }))
        : fetchClientData(supabase, targetClientId, agencyId),
      fetchClientSourceSummaries(supabase, targetClientId),
      fetchConnectionsByClient(supabase, targetClientId),
    ])
    if ('data' in result) initialClientData = result.data
    initialSources = sources
    initialConnections = connections
  }

  return (
    <GenerateFlow
      key={initialIdea?.id ?? 'plain'}
      timeZone={agency?.timezone ?? 'UTC'}
      initialClients={clients}
      initialClientData={initialClientData}
      initialTargetPostCount={initialTargetPostCount}
      allowance={{
        limits: entitlement.limits,
        committed: usage.committed,
        owed: owed ?? NOTHING_OWED,
      }}
      gate={generationGate(entitlement, usage.committed, owed)}
      initialIdea={initialIdea ?? undefined}
      initialClientId={requestedClientId}
      initialSources={initialSources}
      initialConnections={initialConnections}
      waitingDrafts={waitingDrafts}
      loadedAt={new Date().toISOString()}
    />
  )
}

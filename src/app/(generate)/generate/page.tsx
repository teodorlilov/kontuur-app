import { notFound, redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import {
  fetchClientSourceSummaries,
  fetchConnectionsByClient,
  type ClientSourceSummary,
} from '@/lib/queries/db'
import { buildClientData, fetchClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { fetchIdeaById } from '@/features/ideas/lib/ideas'
import { AWAITING_DECISION } from '@/features/ideas/lib/idea-filters'
import { GenerateFlow } from '@/features/generate/components/generate-flow'
import type { MetaConnection } from '@/types/api'

interface PageProps {
  searchParams: Promise<{ ideaId?: string; client?: string }>
}

export default async function GeneratePage({ searchParams }: PageProps) {
  // The params do not depend on the session, and the idea does not depend on the client list, so
  // each wave holds everything that can resolve at once. Only fetchClientData below is genuinely
  // sequential: it needs whichever client the idea or the params resolved to.
  const [{ agencyId }, { ideaId, client }] = await Promise.all([requireSessionUser(), searchParams])
  const supabase = await createServerSupabaseClient()

  const [clients, initialIdea] = await Promise.all([
    getCachedAgencyClients(agencyId),
    ideaId ? fetchIdeaById(ideaId, agencyId) : null,
  ])

  // An `?ideaId=` that resolves to nothing used to fall through to `clients[0]`, so a
  // deleted, mistyped or other-agency id silently opened a full batch run for the
  // agency's oldest client — the user pressed "Generate from this idea" and got N
  // posts for someone else, with nothing saying the idea had been dropped.
  if (ideaId && !initialIdea) notFound()

  // And a bookmarked link re-ran an idea that had already been generated from, or
  // resurrected a dismissed one. Send the user to where the idea actually is rather
  // than 404ing on a row that does exist.
  if (initialIdea && !AWAITING_DECISION.includes(initialIdea.status)) {
    redirect(`/ideas?tab=${initialIdea.status === 'generated' ? 'generated' : 'dismissed'}`)
  }

  let initialClientData: ClientData | null = null
  let initialTargetPostCount = 3
  let initialSources: ClientSourceSummary[] = []
  let initialConnections: MetaConnection[] = []

  // ?client= preselects a client; ignore ids that don't belong to this agency
  const requestedClientId = client && clients.some((c) => c.id === client) ? client : undefined

  // Pre-load client data for the idea's client, the requested client, or the first client
  const targetClientId = initialIdea?.clientId ?? requestedClientId ?? clients[0]?.id
  if (targetClientId) {
    const targetClient = clients.find((c) => c.id === targetClientId)
    if (targetClient && targetClient.posts_per_week > 0) {
      initialTargetPostCount = targetClient.posts_per_week
    }
    // The agency-scoped list row already proves ownership, so buildClientData
    // skips fetchClientData's verification round-trip. The fallback covers an
    // idea whose client is newer than the 60s-cached list — there the DB check
    // still runs.
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
      initialClients={clients}
      initialClientData={initialClientData}
      initialTargetPostCount={initialTargetPostCount}
      initialIdea={initialIdea ?? undefined}
      initialClientId={requestedClientId}
      initialSources={initialSources}
      initialConnections={initialConnections}
    />
  )
}

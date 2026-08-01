import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { fetchIdeaById } from '@/features/ideas/lib/ideas'
import { GenerateWizard } from '@/features/generate/components/generate-wizard'

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

  let initialClientData: ClientData | null = null
  let initialTargetPostCount = 3

  // ?client= preselects a client; ignore ids that don't belong to this agency
  const requestedClientId =
    client && clients.some((c) => c.id === client) ? client : undefined

  // Pre-load client data for the idea's client, the requested client, or the first client
  const targetClientId = initialIdea?.clientId ?? requestedClientId ?? clients[0]?.id
  if (targetClientId) {
    const targetClient = clients.find((c) => c.id === targetClientId)
    if (targetClient && targetClient.posts_per_week > 0) {
      initialTargetPostCount = targetClient.posts_per_week
    }
    const result = await fetchClientData(supabase, targetClientId, agencyId)
    if ('data' in result) initialClientData = result.data
  }

  return (
    <GenerateWizard
      initialClients={clients}
      initialClientData={initialClientData}
      initialTargetPostCount={initialTargetPostCount}
      initialIdea={initialIdea ?? undefined}
      initialClientId={requestedClientId}
    />
  )
}

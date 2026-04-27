import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { fetchIdeaById } from '@/features/ideas/lib/ideas'
import { GenerateWizard } from '@/features/generate/components/generate-wizard'
import type { ClientIdea } from '@/types/api'

interface PageProps {
  searchParams: Promise<{ ideaId?: string }>
}

export default async function GeneratePage({ searchParams }: PageProps) {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()
  const clients = await getCachedAgencyClients(agencyId)
  const { ideaId } = await searchParams

  let initialClientData: ClientData | null = null
  let initialTargetPostCount = 3
  let initialIdea: ClientIdea | null = null

  // If ideaId is present, fetch the idea for pre-fill
  if (ideaId) {
    initialIdea = await fetchIdeaById(ideaId, agencyId)
  }

  // Pre-load client data for either the idea's client or the first client
  const targetClientId = initialIdea?.clientId ?? clients[0]?.id
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
    />
  )
}

import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import {
  fetchBrandProfileByClient,
  fetchLanguageRulesByLanguage,
  fetchPostHistoryByClient,
  fetchTopPostsByClient,
} from '@/lib/queries/db'
import { buildClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { GenerateWizard } from '@/features/generate/components/generate-wizard'

export default async function GeneratePage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()
  const clients = await getCachedAgencyClients(agencyId)

  let initialClientData: ClientData | null = null
  let initialTargetPostCount = 3

  if (clients.length > 0) {
    const first = clients[0]!
    if (first.posts_per_week > 0) initialTargetPostCount = first.posts_per_week

    const [profile, langRules, postHistory, topPosts] = await Promise.all([
      fetchBrandProfileByClient(supabase, first.id),
      fetchLanguageRulesByLanguage(supabase, first.language ?? 'English'),
      fetchPostHistoryByClient(supabase, first.id),
      fetchTopPostsByClient(supabase, first.id),
    ])

    initialClientData = buildClientData(first, profile, langRules, postHistory, topPosts)
  }

  return (
    <GenerateWizard
      initialClients={clients}
      initialClientData={initialClientData}
      initialTargetPostCount={initialTargetPostCount}
    />
  )
}

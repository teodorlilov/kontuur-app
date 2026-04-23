import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchConnectionsByClient } from '@/lib/queries/db'
import { Topbar } from '@/components/layout/topbar'
import { AnalyticsView } from '@/features/analytics/components/analytics-view'

export default async function AnalyticsPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Cache hit — layout already populated this for the current request
  const cachedClients = await getCachedAgencyClients(agencyId)
  // Analytics sorts by name for the dropdown — sort in-memory (no extra query)
  const clients = [...cachedClients].sort((a, b) => a.name.localeCompare(b.name))

  const firstClientId = clients[0]?.id ?? null

  const initialConnections = firstClientId
    ? await fetchConnectionsByClient(supabase, firstClientId)
    : []

  return (
    <>
      <Topbar title="Analytics" />
      <AnalyticsView clients={clients} initialConnections={initialConnections} />
    </>
  )
}

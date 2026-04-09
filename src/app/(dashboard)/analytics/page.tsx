import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { SOCIAL_CONNECTION_COLUMNS } from '@/lib/queries/select-columns'
import { Topbar } from '@/components/layout/topbar'
import { AnalyticsView } from '@/features/analytics/components/analytics-view'
import type { MetaConnection } from '@/types/api'

export default async function AnalyticsPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Cache hit — layout already populated this for the current request
  const cachedClients = await getCachedAgencyClients(agencyId)
  // Analytics sorts by name for the dropdown — sort in-memory (no extra query)
  const clients = [...cachedClients].sort((a, b) => a.name.localeCompare(b.name))

  const firstClientId = clients[0]?.id ?? null

  const { data: initialConnectionRows } = firstClientId
    ? await supabase
        .from('social_connections')
        .select(SOCIAL_CONNECTION_COLUMNS)
        .eq('client_id', firstClientId)
        .order('created_at', { ascending: true })
    : { data: [] }

  const initialConnections = (initialConnectionRows ?? []) as MetaConnection[]

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-6">
        <AnalyticsView clients={clients} initialConnections={initialConnections} />
      </div>
    </>
  )
}

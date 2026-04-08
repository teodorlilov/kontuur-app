import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { Topbar } from '@/components/layout/topbar'
import { AnalyticsView } from '@/features/analytics/components/analytics-view'
import type { MetaConnection } from '@/types/api'

export default async function AnalyticsPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .eq('agency_id', agencyId)
    .order('name', { ascending: true })

  const clients = (clientRows as Array<{ id: string; name: string }> | null) ?? []

  const firstClientId = clients[0]?.id ?? null

  const { data: initialConnectionRows } = firstClientId
    ? await supabase
        .from('social_connections')
        .select('id, platform, account_id, account_name, token_expires_at, created_at')
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

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { AnalyticsView } from '@/features/analytics/components/analytics-view'

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .eq('agency_id', userData.agency_id)
    .order('name', { ascending: true })

  const clients = (clientRows as Array<{ id: string; name: string }> | null) ?? []

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-6">
        <AnalyticsView clients={clients} />
      </div>
    </>
  )
}

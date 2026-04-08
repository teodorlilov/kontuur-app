import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { AccountView } from '@/features/settings/components/account-view'

export default async function AccountPage() {
  const { agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const { data: rawAgency } = await supabase
    .from('agencies')
    .select('id, name, plan, mode, subscription_status, trial_ends_at, plan_client_limit, timezone')
    .eq('id', agencyId)
    .single()

  const agency = rawAgency as {
    id: string
    name: string
    plan: string
    mode: string
    subscription_status: string
    trial_ends_at: string
    plan_client_limit: number
    timezone: string | null
  } | null

  if (!agency) redirect('/login')

  return (
    <AccountView
      agency={{ ...agency, timezone: agency.timezone ?? 'UTC' }}
      currentUserRole={role}
    />
  )
}

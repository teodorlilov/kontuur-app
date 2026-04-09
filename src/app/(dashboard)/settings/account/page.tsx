import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { AccountView } from '@/features/settings/components/account-view'
import { fetchAgencyById } from '@/lib/queries/db'

export default async function AccountPage() {
  const { agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const agency = await fetchAgencyById(supabase, agencyId)

  if (!agency) redirect('/login')

  return (
    <AccountView
      agency={{ ...agency, timezone: agency.timezone ?? 'UTC' }}
      currentUserRole={role}
    />
  )
}

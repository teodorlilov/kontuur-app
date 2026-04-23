import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'
import { fetchAgencyById, fetchTeamMembersByAgency } from '@/lib/queries/db'
import { SettingsView } from '@/features/settings/components/settings-view'

export default async function SettingsPage() {
  const { user, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const [agencyData, agency, members] = await Promise.all([
    getCachedAgency(agencyId),
    fetchAgencyById(supabase, agencyId),
    fetchTeamMembersByAgency(supabase, agencyId),
  ])

  if (!agency) redirect('/login')

  const agencyMode: 'agency' | 'solo' = agencyData?.mode === 'solo' ? 'solo' : 'agency'

  return (
    <SettingsView
      agency={{ ...agency, timezone: agency.timezone ?? 'UTC' }}
      members={members}
      currentUserRole={role}
      currentUserId={user.id}
      agencyMode={agencyMode}
    />
  )
}

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'
import { fetchTeamMembersByAgency } from '@/lib/queries/db'
import { TeamView } from '@/features/settings/components/team-view'

export default async function TeamPage() {
  const { user, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const [agencyData, members] = await Promise.all([
    getCachedAgency(agencyId),
    fetchTeamMembersByAgency(supabase, agencyId),
  ])

  const agencyMode: 'agency' | 'solo' = agencyData?.mode === 'solo' ? 'solo' : 'agency'

  return (
    <TeamView
      members={members}
      currentUserRole={role}
      currentUserId={user.id}
      agencyMode={agencyMode}
    />
  )
}

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'
import { USER_COLUMNS } from '@/lib/queries/select-columns'
import { TeamView } from '@/features/settings/components/team-view'
import type { TeamMember } from '@/types/api'

export default async function TeamPage() {
  const { user, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const [agencyData, { data: rawMembers }] = await Promise.all([
    getCachedAgency(agencyId),
    supabase.from('users').select(USER_COLUMNS).eq('agency_id', agencyId).order('created_at', { ascending: true }),
  ])

  const agencyMode: 'agency' | 'solo' = agencyData?.mode === 'solo' ? 'solo' : 'agency'

  const members = (rawMembers ?? []) as TeamMember[]

  return (
    <TeamView
      members={members}
      currentUserRole={role}
      currentUserId={user.id}
      agencyMode={agencyMode}
    />
  )
}

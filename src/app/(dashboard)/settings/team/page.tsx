import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { TeamView } from '@/features/settings/components/team-view'
import type { TeamMember } from '@/types/api'

export default async function TeamPage() {
  const { user, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const [{ data: rawAgencyData }, { data: rawMembers }] = await Promise.all([
    supabase.from('agencies').select('mode').eq('id', agencyId).single(),
    supabase.from('users').select('id, email, role, created_at').eq('agency_id', agencyId).order('created_at', { ascending: true }),
  ])

  const agencyMode: 'agency' | 'solo' =
    (rawAgencyData as { mode: string } | null)?.mode === 'solo' ? 'solo' : 'agency'

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

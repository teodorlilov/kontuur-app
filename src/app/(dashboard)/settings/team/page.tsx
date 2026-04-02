import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TeamView } from '@/features/settings/components/team-view'
import type { TeamMember } from '@/types/api'

export default async function TeamPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string; role: string } | null
  if (!userData) redirect('/login')

  const { data: rawAgencyData } = await supabase
    .from('agencies')
    .select('mode')
    .eq('id', userData.agency_id)
    .single()

  const agencyMode: 'agency' | 'solo' =
    (rawAgencyData as { mode: string } | null)?.mode === 'solo' ? 'solo' : 'agency'

  const { data: rawMembers } = await supabase
    .from('users')
    .select('id, email, role, created_at')
    .eq('agency_id', userData.agency_id)
    .order('created_at', { ascending: true })

  const members = (rawMembers ?? []) as TeamMember[]

  return (
    <TeamView
      members={members}
      currentUserRole={userData.role}
      currentUserId={user.id}
      agencyMode={agencyMode}
    />
  )
}

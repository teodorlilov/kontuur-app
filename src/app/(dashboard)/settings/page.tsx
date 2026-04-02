import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string } | null
  if (!userData) redirect('/login')

  const { data: rawAgencyData } = await supabase
    .from('agencies')
    .select('mode')
    .eq('id', userData.agency_id)
    .single()

  if ((rawAgencyData as { mode: string } | null)?.mode === 'solo') {
    redirect('/settings/account')
  }

  redirect('/settings/team')
}

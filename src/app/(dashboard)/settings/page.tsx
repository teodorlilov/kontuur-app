import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'

export default async function SettingsPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const { data: rawAgencyData } = await supabase
    .from('agencies')
    .select('mode')
    .eq('id', agencyId)
    .single()

  if ((rawAgencyData as { mode: string } | null)?.mode === 'solo') {
    redirect('/settings/account')
  }

  redirect('/settings/team')
}

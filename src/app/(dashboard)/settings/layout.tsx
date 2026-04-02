import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { SettingsTabs } from '@/features/settings/components/settings-tabs'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  const agencyMode: 'agency' | 'solo' =
    (rawAgencyData as { mode: string } | null)?.mode === 'solo' ? 'solo' : 'agency'

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-6 space-y-6">
        <SettingsTabs agencyMode={agencyMode} />
        {children}
      </div>
    </>
  )
}

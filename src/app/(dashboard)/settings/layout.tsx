import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { Topbar } from '@/components/layout/topbar'
import { SettingsTabs } from '@/features/settings/components/settings-tabs'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const { data: rawAgencyData } = await supabase
    .from('agencies')
    .select('mode')
    .eq('id', agencyId)
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

import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'
import { Topbar } from '@/components/layout/topbar'
import { SettingsTabs } from '@/features/settings/components/settings-tabs'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { agencyId } = await requireSessionUser()

  const agencyData = await getCachedAgency(agencyId)
  const agencyMode: 'agency' | 'solo' = agencyData?.mode === 'solo' ? 'solo' : 'agency'

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

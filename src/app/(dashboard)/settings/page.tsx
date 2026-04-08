import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'

export default async function SettingsPage() {
  const { agencyId } = await requireSessionUser()

  const agencyData = await getCachedAgency(agencyId)

  if (agencyData?.mode === 'solo') {
    redirect('/settings/account')
  }

  redirect('/settings/team')
}

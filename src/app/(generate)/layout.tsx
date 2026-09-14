import { redirect } from 'next/navigation'
import { getCachedUserRecord, requireAuthUserId } from '@/lib/auth/session'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ContourField } from '@/components/layout/contour-field'

/**
 * The wizard is the one surface outside the dashboard shell that spends, so it checks the
 * workspace may spend before it renders; a paused or lapsed workspace lands on Plan & billing.
 */
export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireAuthUserId()
  const record = await getCachedUserRecord(userId)
  const entitlement = record ? await getCachedEntitlement(record.agency_id) : null
  if (!entitlement?.canSpend) redirect(PLAN_AND_BILLING_PATH)

  return (
    <AuthProvider>
      {/* The relative, non-scrolling box ContourField needs — the field draws
          the ground, the flow's own scroll area sits above it at z-[1], and
          the terrain stops at each sheet's edge (cards are clearings). */}
      <div className="relative flex h-dvh flex-col overflow-hidden bg-paper">
        <ContourField />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </AuthProvider>
  )
}

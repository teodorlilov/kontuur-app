import { redirect } from 'next/navigation'
import { getCachedUserRecord, requireAuthUserId } from '@/lib/auth/session'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { pausedNotice } from '@/lib/billing/copy'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ContourField } from '@/components/layout/contour-field'

/**
 * The wizard sits outside the dashboard shell, so it walls a paused workspace itself, by the
 * shell's one rule (`pausedNotice`, src/lib/billing/copy.ts): it lands on Plan & billing. In the
 * trial's grace the route stays open — its waiting drafts live here and can still be approved —
 * and the form gives way to the grace sentence (`generationGate`); every spending call behind it is
 * refused on the server (`requireEntitledRoute`).
 */
export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireAuthUserId()
  const record = await getCachedUserRecord(userId)
  const entitlement = record ? await getCachedEntitlement(record.agency_id) : null
  if (!entitlement || pausedNotice(entitlement)) redirect(PLAN_AND_BILLING_PATH)

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

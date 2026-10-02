import { redirect } from 'next/navigation'
import { getCachedUserRecord, requireAuthUserId } from '@/lib/auth/session'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { AuthProvider } from '@/components/providers/auth-provider'

/**
 * Onboarding creates a brand, so a paused workspace lands on Plan & billing rather than on a form
 * `createClient` would refuse at the end. The plan's cap is NOT checked here: a save re-renders
 * this layout into the action's response (the `{ expire: 0 }` bust in `createClient`), so a cap
 * check would redirect the flow away the moment its new client reached the cap, before the
 * sources stepper. Every "Add client" control is refused at the cap instead (`addBrandGate`,
 * src/lib/billing/copy.ts), and `createClient` refuses one reached by URL. The ground is the
 * shell's — OnboardingShell owns the paper background and the page column.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireAuthUserId()
  const record = await getCachedUserRecord(userId)
  const entitlement = record ? await getCachedEntitlement(record.agency_id) : null
  if (!entitlement?.canSpend) redirect(PLAN_AND_BILLING_PATH)

  return <AuthProvider>{children}</AuthProvider>
}

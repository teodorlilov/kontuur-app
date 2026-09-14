import { redirect } from 'next/navigation'
import { getCachedUserRecord, requireAuthUserId } from '@/lib/auth/session'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { AuthProvider } from '@/components/providers/auth-provider'

/**
 * Onboarding creates a brand, so it checks the workspace may create one before it renders; a
 * paused workspace lands on Plan & billing instead of a form that would be refused at the end.
 * The (dashboard) layout that renders Plan & billing knows not to send it back here
 * (features/onboarding/lib/require-business-setup.ts).
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireAuthUserId()
  const record = await getCachedUserRecord(userId)
  const entitlement = record ? await getCachedEntitlement(record.agency_id) : null
  if (!entitlement?.canCreate) redirect(PLAN_AND_BILLING_PATH)

  // The ground is the shell's, not the layout's — OnboardingShell already owns the paper
  // background and the page column, so a second wrapper here only added a stray inline style.
  return <AuthProvider>{children}</AuthProvider>
}

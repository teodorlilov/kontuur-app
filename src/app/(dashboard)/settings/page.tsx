import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireSessionUser } from '@/lib/auth/session'
import {
  countClientsByAgency,
  fetchAgencyById,
  fetchSaleDocumentsByAgency,
  fetchTeamMembersByAgency,
} from '@/lib/queries/db'
import { entitlementFor } from '@/lib/billing/entitlement'
import { checkoutSummary } from '@/lib/billing/copy'
import { PLAN_LABELS } from '@/lib/billing/plans'
import { readUsage } from '@/lib/billing/usage'
import { listDocumentDownloads } from '@/lib/billing/documents'
import { fetchCanvaTeamStatus } from '@/features/settings/lib/canva-team'
import { SettingsView } from '@/features/settings/components/settings-view'
import { AccountRail, AccountTab } from '@/features/settings/components/account-tab'
import { IntegrationsRail, IntegrationsTab } from '@/features/settings/components/integrations-tab'
import { PlanSection } from '@/features/settings/components/plan-section'
import { PlanActions, type BillingReturn } from '@/features/settings/components/plan-actions'
import { BillingDocuments } from '@/features/settings/components/billing-documents'
import { ProfileRail, ProfileTab } from '@/features/settings/components/profile-tab'
import { TeamRail, TeamTab } from '@/features/settings/components/team-tab'
import { SIGN_IN_PATH } from '@/utils/constants'

/**
 * One uncached agency read: this page follows the account PUT and the Checkout return, so it
 * must never show a stale row — and the entitlement is derived from that same read, the one
 * place a page derives it itself rather than through `getCachedEntitlement`. The client
 * components below receive only the fields they edit or show; the billing columns stay here.
 * The `billing` param is Checkout's return flag, read here once and handed to `PlanActions`.
 */
interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function billingReturnOf(value: string | string[] | undefined): BillingReturn | null {
  return value === 'success' || value === 'cancelled' ? value : null
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [{ userId, agencyId, role }, params] = await Promise.all([
    requireSessionUser(),
    searchParams,
  ])
  const supabase = await createServerSupabaseClient()

  const [agency, members, clientCount, canvaTeam] = await Promise.all([
    fetchAgencyById(supabase, agencyId),
    fetchTeamMembersByAgency(agencyId),
    countClientsByAgency(supabase, agencyId),
    // Resolved here rather than fetched by the Integrations tab on mount, so the panel arrives
    // with its rows instead of rendering a loading state after SSR has finished.
    fetchCanvaTeamStatus(agencyId),
  ])

  if (!agency) redirect(SIGN_IN_PATH)

  const entitlement = entitlementFor(agency, new Date())
  const usage = await readUsage(agencyId, entitlement.periodKey)
  const agencyMode = entitlement.mode
  const account = { name: agency.name, timezone: agency.timezone }

  const isAdmin = role === 'admin'
  // Admins only, and after the row: the list is the workspace's own, the links are minted per render.
  const documents = isAdmin
    ? await listDocumentDownloads(
        createAdminSupabaseClient(),
        await fetchSaleDocumentsByAgency(agencyId)
      )
    : []

  /**
   * Panels are rendered here and handed to the view as elements.
   *
   * The view is a client component because it owns the tab state, and anything it *imports* joins
   * the client bundle whether or not it is interactive. Passing them in instead lets the static
   * ones — Profile, Plan — stay server components and ship no JS at all.
   */
  return (
    <SettingsView
      agencyName={agency.name}
      planLabel={PLAN_LABELS[entitlement.plan]}
      memberCount={members.length}
      agencyMode={agencyMode}
      panels={{
        team: (
          <TeamTab
            members={members}
            currentUserId={userId}
            currentUserRole={role}
            agencyMode={agencyMode}
          />
        ),
        account: (
          <>
            <AccountTab agency={account} currentUserRole={role} />
            <PlanSection entitlement={entitlement} usage={usage} brandCount={clientCount} />
            {isAdmin && (
              <PlanActions
                state={entitlement.state}
                plan={entitlement.plan}
                summary={checkoutSummary(entitlement.mode, clientCount)}
                billingReturn={billingReturnOf(params.billing)}
              />
            )}
            {isAdmin && <BillingDocuments documents={documents} />}
          </>
        ),
        integrations: <IntegrationsTab currentUserId={userId} members={canvaTeam} />,
        profile: <ProfileTab />,
      }}
      rails={{
        team: <TeamRail />,
        account: <AccountRail clientCount={clientCount} isAdmin={isAdmin} />,
        integrations: <IntegrationsRail />,
        profile: <ProfileRail />,
      }}
    />
  )
}

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireSessionUser } from '@/lib/auth/session'
import { countClientsByAgency, fetchAgencyById, fetchTeamMembersByAgency } from '@/lib/queries/db'
import { entitlementFor, isPaying } from '@/lib/billing/entitlement'
import {
  cancelPlanConsequence,
  checkoutActivated,
  deleteWorkspaceNotice,
  deleteWorkspaceRefusal,
} from '@/lib/billing/copy'
import { parseDocumentCustomer } from '@/lib/billing/document-schemas'
import { PLAN_LABELS } from '@/lib/billing/plans'
import { readUsage } from '@/lib/billing/usage'
import { fetchSaleDocumentsByAgency, listDocumentDownloads } from '@/lib/billing/documents'
import { fetchCanvaTeamStatus } from '@/features/settings/lib/canva-team'
import { SettingsView } from '@/features/settings/components/settings-view'
import { AccountRail, AccountTab } from '@/features/settings/components/account-tab'
import { IntegrationsRail, IntegrationsTab } from '@/features/settings/components/integrations-tab'
import { PlanSection } from '@/features/settings/components/plan-section'
import { PlanActions } from '@/features/settings/components/plan-actions'
import { slotsStateOf } from '@/features/settings/lib/slots-state'
import { CheckoutReturn, type BillingReturn } from '@/features/settings/components/checkout-return'
import { BillingDocuments } from '@/features/settings/components/billing-documents'
import { ProfileRail, ProfileTab } from '@/features/settings/components/profile-tab'
import { TeamRail, TeamTab } from '@/features/settings/components/team-tab'
import { SIGN_IN_PATH } from '@/utils/constants'

/** The settings route's params: `billing` is Checkout's return flag. */
interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function billingReturnOf(value: string | string[] | undefined): BillingReturn | null {
  return value === 'success' || value === 'cancelled' ? value : null
}

/**
 * One uncached agency read: this page follows the account PUT and the Checkout return, so it must
 * never show a stale row, and the entitlement is derived from that same read rather than through
 * `getCachedEntitlement`. The billing columns stay here; client components get only the fields
 * they edit or show. Invoice links (admins only) are minted per render; the Checkout return card
 * names only an invoice issued in the current period, so a workspace buying again is never told
 * the previous plan's invoice is on its way. Canva's team status is
 * read here so the Integrations panel arrives with its rows, not a loading state after SSR. Panels
 * are handed to the client `SettingsView` as elements because anything it imports joins the client
 * bundle; this keeps the static ones (Profile, Plan) server components that ship no JS.
 */
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
    fetchCanvaTeamStatus(agencyId),
  ])

  if (!agency) redirect(SIGN_IN_PATH)

  const now = new Date()
  const entitlement = entitlementFor(agency, now)
  const { landed: usage } = await readUsage(agencyId, entitlement.periodKey)
  const agencyMode = entitlement.mode
  const account = { name: agency.name, timezone: agency.timezone }

  const isAdmin = role === 'admin'
  const admin = createAdminSupabaseClient()
  const stored = isAdmin ? await fetchSaleDocumentsByAgency(admin, agencyId) : []
  const documents = await listDocumentDownloads(admin, stored).catch((err: unknown) => {
    console.error(`[settings] document links failed for ${agencyId}:`, err)
    return stored.map((document) => ({ ...document, url: null }))
  })
  const periodStart = agency.current_period_start ? Date.parse(agency.current_period_start) : null
  const latestInvoice = documents.find(
    (document) =>
      document.kind === 'invoice' &&
      periodStart !== null &&
      Date.parse(document.issued_at) >= periodStart
  )
  const billingReturn = billingReturnOf(params.billing)

  return (
    <SettingsView
      agencyName={agency.name}
      planLabel={PLAN_LABELS[entitlement.plan]}
      memberCount={members.length}
      agencyMode={agencyMode}
      panels={{
        team: <TeamTab members={members} currentUserId={userId} currentUserRole={role} />,
        account: (
          <>
            <AccountTab agency={account} currentUserRole={role} />
            <PlanSection entitlement={entitlement} usage={usage} brandCount={clientCount} />
            {isAdmin && (
              <PlanActions
                subscriptionOpen={entitlement.subscriptionOpen}
                ending={entitlement.planEnding}
                cancelConsequence={cancelPlanConsequence(entitlement)}
                slots={slotsStateOf(entitlement, agency, clientCount, now)}
              />
            )}
            {isAdmin && <BillingDocuments documents={documents} />}
          </>
        ),
        integrations: <IntegrationsTab currentUserId={userId} members={canvaTeam} />,
        profile: <ProfileTab />,
      }}
      notice={
        isAdmin && billingReturn ? (
          <CheckoutReturn
            billingReturn={billingReturn}
            paid={isPaying(entitlement)}
            activated={checkoutActivated(
              entitlement,
              latestInvoice
                ? {
                    number: latestInvoice.number,
                    email: parseDocumentCustomer(latestInvoice.customer).email,
                  }
                : null
            )}
          />
        ) : null
      }
      rails={{
        team: <TeamRail />,
        account: (
          <AccountRail
            clientCount={clientCount}
            memberCount={members.length}
            isAdmin={isAdmin}
            agencyName={agency.name}
            agencyMode={agencyMode}
            refusal={deleteWorkspaceRefusal(entitlement)}
            notice={deleteWorkspaceNotice(entitlement)}
          />
        ),
        integrations: <IntegrationsRail />,
        profile: <ProfileRail />,
      }}
    />
  )
}

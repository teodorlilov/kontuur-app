import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { fetchAgencyById, fetchTeamMembersByAgency } from '@/lib/queries/db'
import { entitlementFor } from '@/lib/billing/entitlement'
import { readUsage } from '@/lib/billing/usage'
import { fetchCanvaTeamStatus } from '@/features/settings/lib/canva-team'
import { SettingsView } from '@/features/settings/components/settings-view'
import { AccountRail, AccountTab } from '@/features/settings/components/account-tab'
import { IntegrationsRail, IntegrationsTab } from '@/features/settings/components/integrations-tab'
import { PlanSection } from '@/features/settings/components/plan-section'
import { ProfileRail, ProfileTab } from '@/features/settings/components/profile-tab'
import { TeamRail, TeamTab } from '@/features/settings/components/team-tab'
import { SIGN_IN_PATH } from '@/utils/constants'

export default async function SettingsPage() {
  const { userId, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // One uncached agency read: this page follows the account PUT and the Checkout return, so it
  // must never show a stale row — and the entitlement is derived from the same read.
  const [agency, members, { count: clientCount }, canvaTeam] = await Promise.all([
    fetchAgencyById(supabase, agencyId),
    fetchTeamMembersByAgency(agencyId),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
    // Resolved here rather than fetched by the Integrations tab on mount, so the panel arrives
    // with its rows instead of rendering a loading state after SSR has finished.
    fetchCanvaTeamStatus(agencyId),
  ])

  if (!agency) redirect(SIGN_IN_PATH)

  const entitlement = entitlementFor(agency, new Date())
  const usage = await readUsage(agencyId, entitlement.periodKey)
  const agencyMode = entitlement.mode

  const isAdmin = role === 'admin'

  /**
   * Panels are rendered here and handed to the view as elements.
   *
   * The view is a client component because it owns the tab state, and anything it *imports* joins
   * the client bundle whether or not it is interactive. Passing them in instead lets the static
   * ones — Profile, Plan — stay server components and ship no JS at all.
   */
  return (
    <SettingsView
      agency={agency}
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
            <AccountTab agency={agency} currentUserRole={role} />
            <PlanSection entitlement={entitlement} usage={usage} brandCount={clientCount ?? 0} />
          </>
        ),
        integrations: <IntegrationsTab currentUserId={userId} members={canvaTeam} />,
        profile: <ProfileTab />,
      }}
      rails={{
        team: <TeamRail />,
        account: <AccountRail clientCount={clientCount ?? 0} isAdmin={isAdmin} />,
        integrations: <IntegrationsRail />,
        profile: <ProfileRail />,
      }}
    />
  )
}

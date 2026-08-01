import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency } from '@/lib/queries/cache'
import { fetchAgencyById, fetchTeamMembersByAgency } from '@/lib/queries/db'
import { fetchCanvaTeamStatus } from '@/features/settings/lib/canva-team'
import { SettingsView } from '@/features/settings/components/settings-view'
import { AccountRail, AccountTab } from '@/features/settings/components/account-tab'
import { IntegrationsRail, IntegrationsTab } from '@/features/settings/components/integrations-tab'
import { PlanSection, UpgradeRailAction } from '@/features/settings/components/plan-section'
import { ProfileRail, ProfileTab } from '@/features/settings/components/profile-tab'
import { TeamRail, TeamTab } from '@/features/settings/components/team-tab'
import { RailBox } from '@/components/ui/form'

export default async function SettingsPage() {
  const { userId, agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const [agencyData, agency, members, { count: clientCount }, canvaTeam] = await Promise.all([
    getCachedAgency(agencyId),
    fetchAgencyById(supabase, agencyId),
    fetchTeamMembersByAgency(supabase, agencyId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId),
    // Resolved here rather than fetched by the Integrations tab on mount, so the panel arrives
    // with its rows instead of rendering a loading state after SSR has finished.
    fetchCanvaTeamStatus(agencyId),
  ])

  if (!agency) redirect('/login')

  const agencyMode: 'agency' | 'solo' = agencyData?.mode === 'solo' ? 'solo' : 'agency'

  const agencyInfo = { ...agency, timezone: agency.timezone ?? 'UTC' }
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
      agency={agencyInfo}
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
            <AccountTab agency={agencyInfo} currentUserRole={role} />
            <PlanSection agency={agencyInfo} clientCount={clientCount ?? 0} />
          </>
        ),
        integrations: <IntegrationsTab currentUserId={userId} members={canvaTeam} />,
        profile: <ProfileTab />,
      }}
      rails={{
        team: <TeamRail />,
        account: (
          <>
            <AccountRail clientCount={clientCount ?? 0} isAdmin={isAdmin} />
            <RailBox title="Plan">
              <UpgradeRailAction />
            </RailBox>
          </>
        ),
        integrations: <IntegrationsRail />,
        profile: <ProfileRail />,
      }}
    />
  )
}

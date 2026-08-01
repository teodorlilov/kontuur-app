import { redirect } from 'next/navigation'
import NextTopLoader from 'nextjs-toploader'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { getAuthUser, getCachedUserRecord } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients, getCachedPendingRows } from '@/lib/queries/cache'
import { getCachedNewIdeasCount } from '@/features/ideas/lib/cache'
import { USER_AUTH_COLUMNS } from '@/lib/queries/select-columns'
import { fetchActiveRuns } from '@/lib/generation/runs'
import { extractInitials } from '@/utils/format'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ShellProvider } from '@/components/layout/shell-context'
import { ContourField } from '@/components/layout/contour-field'
import { Sidebar } from '@/components/layout/sidebar'
import type { ActiveRun } from '@/types/api'

/**
 * Formatted here rather than in the rail because a client component calling
 * new Date() renders one value during SSR and another after hydration, and
 * would use the browser's timezone instead of the agency's.
 */
function formatToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date())
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createServerSupabaseClient()

  // Fetch agency mode for sidebar
  let rawUserData = await getCachedUserRecord(user.id)

  // If no users record exists, auto-create from signup metadata (handles cases where
  // the /auth/callback was not reached after email confirmation)
  if (!rawUserData) {
    const admin = createAdminSupabaseClient()
    await createUserRecord(admin, {
      id: user.id,
      email: user.email ?? '',
      user_metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    })

    const { data: freshUserData } = await supabase
      .from('users')
      .select(USER_AUTH_COLUMNS)
      .eq('id', user.id)
      .single()
    rawUserData = freshUserData
  }

  const userData = rawUserData as { agency_id: string; role: string } | null

  let agencyMode: 'agency' | 'solo' = 'agency'
  let pendingCount = 0
  let ideasCount = 0
  let agencyName = ''
  let timezone = 'UTC'
  let clients: Array<{ id: string; name: string }> = []
  let activeRuns: ActiveRun[] = []

  if (userData) {
    const [agencyData, agencyClients, pendingRows, ideas, runs] = await Promise.all([
      getCachedAgency(userData.agency_id),
      getCachedAgencyClients(userData.agency_id),
      getCachedPendingRows(userData.agency_id),
      getCachedNewIdeasCount(userData.agency_id),
      fetchActiveRuns(supabase, userData.agency_id),
    ])

    if (agencyData?.mode === 'solo') agencyMode = 'solo'
    agencyName = agencyData?.name ?? ''
    timezone = agencyData?.timezone ?? 'UTC'
    pendingCount = pendingRows.length
    ideasCount = ideas
    clients = agencyClients.map((client) => ({ id: client.id, name: client.name }))
    activeRuns = runs
  }

  // The rail avatar is the signed-in person, not the workspace — the sidebar
  // block already names the agency.
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'You'

  return (
    <>
      <NextTopLoader color="var(--forest)" height={2} showSpinner={false} />
      <AuthProvider>
        <ShellProvider
          agencyName={agencyName}
          agencyMode={agencyMode}
          userInitials={extractInitials(displayName)}
          todayLabel={formatToday(timezone)}
          clients={clients}
        >
          <div className="app-shell flex h-screen gap-3.5 overflow-hidden bg-paper p-3">
            <Sidebar
              agencyMode={agencyMode}
              agencyName={agencyName}
              pendingCount={pendingCount}
              ideasCount={ideasCount}
              activeRuns={activeRuns}
            />
            {/* The column is a fixed-size box — .app-shell is h-screen
                overflow-hidden and only <main> scrolls — so an absolute canvas
                covers exactly the visible area, stays out from under the sidebar,
                and the content scrolls over a ground plane that does not move. */}
            {/* No shell topbar: each page opens with its own PageHeader, whose
                rail carries the workspace utilities. */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <ContourField />
              <main className="app-content relative z-[1] flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        </ShellProvider>
      </AuthProvider>
    </>
  )
}

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
import { AuthProvider } from '@/components/providers/auth-provider'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import type { ActiveRun } from '@/types/api'

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
    pendingCount = pendingRows.length
    ideasCount = ideas
    clients = agencyClients.map((client) => ({ id: client.id, name: client.name }))
    activeRuns = runs
  }

  return (
    <>
      <NextTopLoader color="var(--forest)" height={2} showSpinner={false} />
      <AuthProvider>
        <div className="app-shell flex h-screen gap-3.5 overflow-hidden bg-paper p-3">
          <Sidebar
            agencyMode={agencyMode}
            agencyName={agencyName}
            pendingCount={pendingCount}
            ideasCount={ideasCount}
            clients={clients}
            activeRuns={activeRuns}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar agencyMode={agencyMode} agencyName={agencyName} />
            <main className="app-content flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </AuthProvider>
    </>
  )
}

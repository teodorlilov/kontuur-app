import { redirect } from 'next/navigation'
import NextTopLoader from 'nextjs-toploader'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { getAuthUser, getCachedUserRecord } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients, getCachedPendingRows } from '@/lib/queries/cache'
import { getCachedNewIdeasCount } from '@/features/ideas/lib/cache'
import { USER_AUTH_COLUMNS } from '@/lib/queries/select-columns'
import { AuthProvider } from '@/components/providers/auth-provider'
import { Sidebar } from '@/components/layout/sidebar'

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

  if (userData) {
    const [agencyData] = await Promise.all([
      getCachedAgency(userData.agency_id),
      getCachedAgencyClients(userData.agency_id),
    ])

    if (agencyData?.mode === 'solo') agencyMode = 'solo'
    agencyName = agencyData?.name ?? ''

    // Pending review count for badge — React cache deduplicates with clients/dashboard pages
    const pendingRows = await getCachedPendingRows(userData.agency_id)
    pendingCount = pendingRows.length

    // New ideas count for sidebar badge
    ideasCount = await getCachedNewIdeasCount(userData.agency_id)
  }

  return (
    <>
      <NextTopLoader color="#2C3E50" height={2} showSpinner={false} />
      <AuthProvider>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-page)' }}>
          <Sidebar agencyMode={agencyMode} pendingCount={pendingCount} ideasCount={ideasCount} agencyName={agencyName} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </AuthProvider>
    </>
  )
}

import { redirect } from 'next/navigation'
import NextTopLoader from 'nextjs-toploader'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { getAuthUser, getCachedUserRecord } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients } from '@/lib/queries/cache'
import { AuthProvider } from '@/components/providers/auth-provider'
import { Sidebar } from '@/components/layout/sidebar'
import { NotificationsBell } from '@/components/layout/notifications-bell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
      .select('agency_id, role')
      .eq('id', user.id)
      .single()
    rawUserData = freshUserData
  }

  const userData = rawUserData as { agency_id: string; role: string } | null

  let agencyMode: 'agency' | 'solo' = 'agency'
  let pendingCount = 0

  if (userData) {
    const [agencyData, clients] = await Promise.all([
      getCachedAgency(userData.agency_id),
      getCachedAgencyClients(userData.agency_id),
    ])

    if (agencyData?.mode === 'solo') agencyMode = 'solo'

    // Pending review count for badge
    const clientIds = clients.map((c) => c.id)

    if (clientIds.length > 0) {
      const { count } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review')
        .in('client_id', clientIds)

      pendingCount = count ?? 0
    }
  }

  return (
    <>
    <NextTopLoader color="var(--brand-purple, #7c3aed)" height={2} showSpinner={false} />
    <AuthProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-page)' }}>
        <Sidebar agencyMode={agencyMode} pendingCount={pendingCount} />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <div style={{ position: 'fixed', top: 12, right: 40, zIndex: 50 }}>
          <NotificationsBell />
        </div>
      </div>
    </AuthProvider>
    </>
  )
}

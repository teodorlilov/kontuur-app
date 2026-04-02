import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { AuthProvider } from '@/components/providers/auth-provider'
import { Sidebar } from '@/components/layout/sidebar'
import { ToastProvider } from '@/components/ui/toast'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch agency mode for sidebar
  let { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single()

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
    const { data: rawAgencyData } = await supabase
      .from('agencies')
      .select('mode')
      .eq('id', userData.agency_id)
      .single()

    const agencyData = rawAgencyData as { mode: string } | null
    if (agencyData?.mode === 'solo') agencyMode = 'solo'

    // Pending review count for badge
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id')
      .eq('agency_id', userData.agency_id)

    const clientIds = (clientRows as Array<{ id: string }> | null)?.map((c) => c.id) ?? []

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
    <AuthProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar agencyMode={agencyMode} pendingCount={pendingCount} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <ToastProvider />
    </AuthProvider>
  )
}

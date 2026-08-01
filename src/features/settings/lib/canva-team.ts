import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export interface CanvaTeamMember {
  id: string
  email: string
  role: string
  canvaConnected: boolean
  canvaAccountName: string | null
  connectionId: string | null
  tokenExpired: boolean
}

/**
 * Every member of the agency with their personal Canva connection state.
 *
 * Canva connections are per-user, not per-agency, so the Integrations tab has to show who on the
 * team has linked an account. Reads through the admin client because a member's row is not
 * visible to another member under RLS.
 */
export async function fetchCanvaTeamStatus(agencyId: string): Promise<CanvaTeamMember[]> {
  const admin = createAdminSupabaseClient()

  const { data: users } = await admin
    .from('users')
    .select('id, email, role')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })

  if (!users?.length) return []

  const { data: connections } = await admin
    .from('social_connections')
    .select('id, user_id, account_name, token_expires_at')
    .eq('platform', 'canva')
    .in(
      'user_id',
      users.map((u) => u.id)
    )

  const byUser = new Map((connections ?? []).map((c) => [c.user_id, c]))

  return users.map((user) => {
    const conn = byUser.get(user.id)
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      canvaConnected: !!conn,
      canvaAccountName: conn?.account_name ?? null,
      connectionId: conn?.id ?? null,
      tokenExpired: conn?.token_expires_at ? new Date(conn.token_expires_at) < new Date() : false,
    }
  })
}

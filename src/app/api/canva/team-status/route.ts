import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * GET /api/canva/team-status
 * Returns all team members in the agency with their Canva connection status.
 */
export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const admin = createAdminSupabaseClient()

  // Fetch all users in the agency
  const { data: users } = await admin
    .from('users')
    .select('id, email, role')
    .eq('agency_id', auth.agencyId)
    .order('created_at', { ascending: true })

  if (!users?.length) {
    return NextResponse.json({ members: [] })
  }

  const userIds = users.map((u) => u.id)

  // Fetch Canva connections for those users
  const { data: connections } = await admin
    .from('social_connections')
    .select('id, user_id, account_name, token_expires_at')
    .eq('platform', 'canva')
    .in('user_id', userIds)

  const connMap = new Map(
    (connections ?? []).map((c) => [c.user_id, c])
  )

  const members = users.map((u) => {
    const conn = connMap.get(u.id)
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      canvaConnected: !!conn,
      canvaAccountName: conn?.account_name ?? null,
      connectionId: conn?.id ?? null,
      tokenExpired: conn?.token_expires_at
        ? new Date(conn.token_expires_at) < new Date()
        : false,
    }
  })

  return NextResponse.json({ members })
}

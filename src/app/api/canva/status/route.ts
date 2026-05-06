import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * GET /api/canva/status
 * Returns whether the current user has a connected Canva account.
 */
export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('social_connections')
    .select('account_name')
    .eq('user_id', auth.userId)
    .eq('platform', 'canva')
    .single()

  return NextResponse.json({
    connected: !!data,
    accountName: data?.account_name ?? undefined,
  })
}

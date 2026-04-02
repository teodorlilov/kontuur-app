import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'

export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { data: members, error } = await supabase
    .from('users')
    .select('id, email, role, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ members: members ?? [] })
}

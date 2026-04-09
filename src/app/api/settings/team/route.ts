import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchTeamMembersByAgency } from '@/lib/queries/db'

export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const members = await fetchTeamMembersByAgency(supabase, agencyId)

  return NextResponse.json({ members })
}

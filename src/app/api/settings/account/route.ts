import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyAdminRole } from '@/lib/auth/helpers'
import { fetchAgencyById } from '@/lib/queries/db'

export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const agency = await fetchAgencyById(supabase, agencyId)

  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 500 })
  }

  return NextResponse.json({ agency })
}

export async function PUT(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const isAdmin = await verifyAdminRole(supabase, userId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can update account settings' }, { status: 403 })
  }

  let body: { name?: string; timezone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    return NextResponse.json({ error: 'Agency name cannot be empty' }, { status: 400 })
  }

  const updates: { name?: string; timezone?: string } = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.timezone !== undefined) updates.timezone = body.timezone

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('agencies')
    .update(updates)
    .eq('id', agencyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag('agencies', 'max')
  return NextResponse.json({ success: true })
}

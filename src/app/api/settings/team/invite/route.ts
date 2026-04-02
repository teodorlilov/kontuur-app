import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyAdminRole } from '@/lib/auth/helpers'
import { validateEmail } from '@/lib/validation'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const isAdmin = await verifyAdminRole(supabase, userId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can invite team members' }, { status: 403 })
  }

  // Parse and validate body
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || validateEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  // Check if email already exists in this agency
  const admin = createAdminSupabaseClient()
  const { data: existingMembers } = await admin
    .from('users')
    .select('email')
    .eq('agency_id', agencyId)
    .eq('email', email)

  if (existingMembers && existingMembers.length > 0) {
    return NextResponse.json(
      { error: 'This email is already a team member' },
      { status: 409 }
    )
  }

  // Invite via Supabase Auth
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_agency_id: agencyId, role: 'member' },
    redirectTo: `${appUrl}/auth/callback`,
  })

  if (inviteError) {
    // Handle common Supabase errors with friendly messages
    if (inviteError.message.includes('already been registered')) {
      return NextResponse.json(
        { error: 'This email already has an account. They cannot be invited again.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

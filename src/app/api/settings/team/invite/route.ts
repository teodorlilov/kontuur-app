import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyAdminRole } from '@/lib/auth/helpers'
import { validateEmail } from '@/lib/validation'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Only these two roles are meaningful: 'admin' is what every permission check in
 * the app tests for, and anything else behaves as a plain member. The default
 * keeps an omitted role from silently inviting an admin.
 */
const inviteSchema = z.object({
  email: z.string(),
  role: z.enum(['admin', 'member']).default('member'),
})

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const isAdmin = await verifyAdminRole(supabase, userId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can invite team members' }, { status: 403 })
  }

  let parsed: z.infer<typeof inviteSchema>
  try {
    parsed = inviteSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = parsed.email.trim().toLowerCase()
  // validateEmail returns the reason it is invalid, or null when it is fine.
  if (validateEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const role = parsed.role

  const admin = createAdminSupabaseClient()
  const { data: existingMembers } = await admin
    .from('users')
    .select('email')
    .eq('agency_id', agencyId)
    .eq('email', email)

  if (existingMembers && existingMembers.length > 0) {
    return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  // createUserRecord reads `role` out of this metadata when the invite is accepted.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_agency_id: agencyId, role },
    redirectTo: `${appUrl}/auth/callback`,
  })

  if (inviteError) {
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

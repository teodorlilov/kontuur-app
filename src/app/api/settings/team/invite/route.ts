import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyAdminRole } from '@/lib/auth/helpers'
import { validateEmail } from '@/lib/validation'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { inviteMember } from '@/features/settings/lib/invite-member'

/**
 * Only these two roles are meaningful: 'admin' is what every permission check in
 * the app tests for, and anything else behaves as a plain member. The default
 * keeps an omitted role from silently inviting an admin.
 */
const inviteSchema = z.object({
  email: z.string(),
  role: z.enum(['admin', 'member']).default('member'),
})

/**
 * Invite a teammate by email. Admin only.
 *
 * This route authenticates, checks the caller is an admin, and validates the address, trimmed and
 * lower-cased; the invite itself — who may be invited, the email, the row — is `inviteMember`
 * (src/features/settings/lib/invite-member.ts), whose status and sentence this answers with, or on
 * success its notice, null when there is nothing to say.
 */
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
  if (validateEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const result = await inviteMember(createAdminSupabaseClient(), {
    agencyId,
    inviterId: userId,
    email,
    role: parsed.role,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, notice: result.notice })
}

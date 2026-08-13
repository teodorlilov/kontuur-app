import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1).max(320),
})

/**
 * Send a password-reset link.
 *
 * Answers 200 whether or not the address has an account. It used to answer
 * 404 "No account found with this email", which made this a user-enumeration
 * oracle — anyone could test which addresses are registered — and the reason
 * it survived was that the reset page showed that error to the visitor.
 *
 * The dialog that replaced that page says "if an account exists for that
 * address, a reset link is on its way", so the error had nowhere left to go and
 * the oracle closed with it. Resolves docs/TECH-DEBT.md §6.5.
 */
export async function POST(request: NextRequest) {
  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const email = parsed.data.email
  const admin = createAdminSupabaseClient()

  const { data: userRow } = await admin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  // Nothing to send, but the caller is told the same thing either way.
  if (!userRow) {
    return NextResponse.json({ success: true })
  }

  const origin = new URL(request.url).origin
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  })

  if (error) {
    // Logged at the boundary rather than returned: a provider-side failure is
    // ours, and its message must not become another signal about the address.
    console.error('[forgot-password] resetPasswordForEmail failed', {
      message: error.message,
    })
    return NextResponse.json({ error: 'Could not send the reset email. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

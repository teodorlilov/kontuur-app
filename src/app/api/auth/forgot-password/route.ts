import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/auth/rate-limit'

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1).max(320),
})

/**
 * 5 attempts per 15 minutes, keyed by client IP.
 *
 * The IP, not the address: keying on the email would let one caller walk a list, sending
 * one message per address and never tripping a per-address counter. This is the only
 * unauthenticated endpoint that causes mail to be sent, so there is no user id to key on
 * and the source is all there is.
 *
 * Per-instance like everything else here (see rate-limit.ts) — a loop against one warm
 * lambda is stopped; a distributed one is not. That is the honest bound.
 */
const FORGOT_PASSWORD_RATE_LIMIT = { max: 5, windowMs: 15 * 60_000 }

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
  // `x-forwarded-for` is set by Vercel's proxy and is the caller's IP; the fallback keeps
  // one shared bucket rather than an unlimited one when the header is absent (local dev).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = checkRateLimit(`forgot-password:${ip}`, FORGOT_PASSWORD_RATE_LIMIT)
  if (!rl.allowed) {
    // 429 regardless of whether the address exists — the same reasoning that closed the
    // enumeration oracle below applies to the throttle telling a caller anything.
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

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
    return NextResponse.json(
      { error: 'Could not send the reset email. Try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Send a password-reset link.
 *
 * NOTE: answers 404 "No account found with this email" for an unknown address,
 * which makes this endpoint a user-enumeration oracle — anyone can test whether
 * a given email has an account here. The usual fix is to answer 200 either way
 * and say "if that address has an account, a link is on its way", but that
 * removes a real error the signup/login UI currently shows, so it is a product
 * decision rather than a silent change. See docs/TECH-DEBT.md §6.5.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: userRow } = await admin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (!userRow) {
    return NextResponse.json({ error: 'No account found with this email' }, { status: 404 })
  }

  const origin = new URL(request.url).origin
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

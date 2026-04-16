import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

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

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?type=recovery`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

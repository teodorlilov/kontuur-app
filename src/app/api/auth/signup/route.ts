import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { USER_RECORD_TAG } from '@/lib/auth/session'

/**
 * `mode` reaches agencies.mode and decides whether the account gets a solo
 * client, so an unrecognised value has to be rejected rather than stored.
 */
const signupSchema = z.object({
  businessName: z.string().trim().min(1),
  mode: z.enum(['agency', 'solo']).default('agency'),
})

/** Provision an authenticated user's agency, user row, and (in solo mode) their first client. */
export async function POST(request: Request) {
  // User must already be authenticated (browser called signUp first)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: z.infer<typeof signupSchema>
  try {
    body = signupSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { businessName, mode } = body

  // maybeSingle: no row yet is the expected state for a fresh signup.
  const { data: existingUser, error: existingError } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (existingError) {
    console.error('[signup] user lookup failed:', existingError.message)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  if (existingUser) return NextResponse.json({ success: true })

  // Use admin client for data inserts — bypasses RLS
  const admin = createAdminSupabaseClient()

  const { data: agencyData, error: agencyError } = await admin
    .from('agencies')
    .insert({ name: businessName, mode })
    .select('id')
    .single()

  if (agencyError || !agencyData) {
    console.error('[signup] agency insert failed:', agencyError?.message ?? 'no row returned')
    return NextResponse.json({ error: 'Failed to create agency' }, { status: 500 })
  }

  const agencyId = (agencyData as { id: string }).id

  const { error: userError } = await admin.from('users').insert({
    id: user.id,
    agency_id: agencyId,
    email: user.email ?? '',
    role: 'admin',
  })

  if (userError) {
    console.error('[signup] user insert failed:', userError.message)
    return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
  }

  // A page render may already have cached "no record" for this id while signup was in flight.
  revalidateTag(USER_RECORD_TAG, 'max')

  if (mode === 'solo') {
    const { data: clientData, error: clientError } = await admin
      .from('clients')
      .insert({ agency_id: agencyId, name: businessName, posts_per_week: 3 })
      .select('id')
      .single()

    // A solo account with no client cannot generate anything, so a dropped
    // insert here is a failed signup, not a cosmetic gap.
    if (clientError || !clientData) {
      console.error('[signup] solo client insert failed:', clientError?.message ?? 'no row returned')
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    const clientId = (clientData as { id: string }).id
    const [{ error: profileError }, { error: scheduleError }] = await Promise.all([
      admin.from('brand_profiles').insert({ client_id: clientId }),
      admin.from('posting_schedules').insert({ client_id: clientId }),
    ])
    if (profileError || scheduleError) {
      console.error(
        '[signup] solo defaults insert failed:',
        profileError?.message ?? scheduleError?.message
      )
      return NextResponse.json({ error: 'Failed to create client defaults' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

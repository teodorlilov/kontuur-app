import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { USER_RECORD_TAG } from '@/lib/auth/session'

/**
 * Provision an authenticated user's agency, user row, and (in solo mode) their first client.
 *
 * This route used to do the provisioning itself, in ninety lines that were a near-copy of
 * `createUserRecord` — and the browser fires BOTH: `sign-up-view` puts `{businessName, mode}` into
 * `user_metadata` on signUp AND posts the same body here, so whichever landed first won.
 *
 * They had already diverged three ways. This route wrote `email: user.email ?? ''`, and that column
 * is a lookup key — forgot-password finds accounts by it, so a blank one is an account nobody can
 * recover. It also wrote `posts_per_week: 3` by hand, which is the column's own default. And it
 * validated `mode` while the other path stored whatever the metadata held, despite this file's own
 * comment saying an unrecognised mode has to be rejected.
 *
 * Now it authenticates and delegates. The validation moved INTO createUserRecord, so the auth
 * callback gets it too, and the idempotency guard that path already had covers this one — which is
 * what makes running both harmless rather than a race.
 */
export async function POST() {
  // The browser has already called signUp, so a session exists by the time this runs.
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await createUserRecord(createAdminSupabaseClient(), {
      id: user.id,
      email: user.email ?? '',
      user_metadata: user.user_metadata ?? {},
    })
  } catch (err) {
    console.error('[signup] provisioning failed:', err)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  // A page render may already have cached "no record" for this id while signup was in flight.
  revalidateTag(USER_RECORD_TAG, 'max')
  return NextResponse.json({ success: true })
}

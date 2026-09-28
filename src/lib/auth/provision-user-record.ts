import 'server-only'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { getAuthUser, getCachedUserRecord } from '@/lib/auth/session'
import { USER_AUTH_COLUMNS } from '@/lib/queries/select-columns'

/** The agency and role `getCachedUserRecord` reads for a person. */
type UserRecord = NonNullable<Awaited<ReturnType<typeof getCachedUserRecord>>>

/**
 * What a render learns from `provisionUserRecord`: no auth user stands behind the id, or the
 * person's row — `null` only when the read after creating it finds none.
 */
type ProvisionedUser = { isSignedIn: false } | { isSignedIn: true; record: UserRecord | null }

/**
 * The signed-in person's `users` row, created through `createUserRecord` when they have none: the
 * dashboard layout's fallback for a signup whose confirmation callback never reached it, and
 * /setup-password's for an invitee who opened their link and left before the dashboard. With no
 * row, a resend refuses that invitee's confirmed login and forgot-password sends them nothing
 * (`nameLogin`, `PENDING_INVITE_HOLD_DAYS`, src/features/settings/lib/invite-member.ts). `userId`
 * is the id middleware validated; only a missing row pays for `getAuthUser`'s auth-server round
 * trip. Throws what `createUserRecord` throws, as for an invitee whose invite is gone, and on a
 * failed read after it.
 */
export async function provisionUserRecord(userId: string): Promise<ProvisionedUser> {
  const record = await getCachedUserRecord(userId)
  if (record) return { isSignedIn: true, record }

  const user = await getAuthUser()
  if (!user) return { isSignedIn: false }

  await createUserRecord(createAdminSupabaseClient(), {
    id: user.id,
    email: user.email ?? '',
    user_metadata: user.user_metadata ?? {},
  })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select(USER_AUTH_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`users read after provisioning failed for ${userId}: ${error.message}`)
  return { isSignedIn: true, record: data }
}

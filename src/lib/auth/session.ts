import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AUTH_USER_ID_HEADER, AUTH_USER_NAME_HEADER } from '@/lib/auth/headers'
import { getUserRecord } from '@/lib/auth/helpers'

/** Cache tag for a user's agency and role. Bust it whenever either changes. */
export const USER_RECORD_TAG = 'user-record'

/**
 * Returns the authenticated user's id, or null.
 *
 * Reads the id middleware validated rather than calling the auth server again: `getUser()` is a
 * network round trip, React `cache()` cannot dedupe across the middleware/render boundary, and
 * middleware already runs on every matched route. This is the hot path — prefer it.
 */
export const getAuthUserId = cache(async (): Promise<string | null> => {
  return (await headers()).get(AUTH_USER_ID_HEADER)
})

/**
 * The signed-in person's display name — their full name, or their email if they never set one.
 *
 * Resolved from the same validated header pass as `getAuthUserId`, so the app shell can label the
 * rail avatar without an auth-server round trip on every navigation.
 */
export const getAuthDisplayName = cache(async (): Promise<string> => {
  const encoded = (await headers()).get(AUTH_USER_NAME_HEADER)
  return encoded ? decodeURIComponent(encoded) : ''
})

/**
 * Returns the full authenticated user, at the cost of an auth-server round trip.
 *
 * Only for callers that need more than the id — `email` and `user_metadata` when creating a
 * missing `users` row. Everything else wants `getAuthUserId`.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
})

/**
 * Returns the user's DB record (agency_id, role).
 *
 * Two layers, matching lib/queries/cache.ts: `unstable_cache` persists it across requests so a
 * near-immutable row is not re-queried on every navigation, and React `cache()` dedupes the layout
 * and page within one render. The admin client is required inside `unstable_cache` — a
 * request-scoped client cannot be captured by a cross-request cache.
 *
 * Call `revalidateTag(USER_RECORD_TAG)` after anything that changes a user's agency or role.
 *
 * Caching a miss is safe because `createUserRecord` is idempotent: the layout's fallback re-runs
 * while the null is cached, finds the existing row and writes nothing.
 */
const fetchUserRecord = unstable_cache(
  async (userId: string) => getUserRecord(createAdminSupabaseClient(), userId),
  ['user-record'],
  { revalidate: 300, tags: [USER_RECORD_TAG] }
)

export const getCachedUserRecord = cache(fetchUserRecord)

/**
 * Validates the current session and returns the auth context.
 * Redirects to /login if unauthenticated. For use in Server Component pages.
 *
 * Usage:
 *   const { userId, agencyId, role } = await requireSessionUser()
 */
export async function requireSessionUser() {
  const userId = await getAuthUserId()
  if (!userId) redirect('/login')

  const userData = await getCachedUserRecord(userId)
  if (!userData) redirect('/login')

  return { userId, agencyId: userData.agency_id, role: userData.role }
}

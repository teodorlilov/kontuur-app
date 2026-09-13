import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AUTH_USER_ID_HEADER, AUTH_USER_NAME_HEADER } from '@/lib/auth/headers'
import { getCachedUserRecord } from '@/lib/auth/helpers'
import { SIGN_IN_PATH } from '@/utils/constants'

/**
 * Re-exported from `helpers`, which owns this row.
 *
 * Both used to be defined here, and API routes cached the same row a SECOND time under a tag nothing
 * ever revalidated — so removing a team member invalidated the page path and left every route
 * resolving them to the agency they had just left. One definition, one tag, both paths.
 */
export { getCachedUserRecord, USER_RECORD_TAG } from '@/lib/auth/helpers'

/**
 * The signed-in gate for a layout or page: the validated user id, or a redirect to the sign-in
 * dialog. The one place that decides where a signed-out render goes — `requireSessionUser` and
 * every protected layout call this rather than repeating the check.
 *
 * Reads the id middleware validated rather than calling the auth server again: `getUser()` is a
 * network round trip, React `cache()` cannot dedupe across the middleware/render boundary, and
 * middleware already runs on every matched route. This is the hot path — prefer it.
 */
export async function requireAuthUserId(): Promise<string> {
  const userId = (await headers()).get(AUTH_USER_ID_HEADER)
  if (!userId) redirect(SIGN_IN_PATH)
  return userId
}

/**
 * The signed-in person's display name — their full name, or their email if they never set one.
 *
 * Resolved from the same validated header pass as `requireAuthUserId`, so the app shell can label
 * the rail avatar without an auth-server round trip on every navigation.
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
 * Validates the current session and returns the auth context.
 * Redirects to the sign-in dialog if unauthenticated. For use in Server Component pages.
 *
 * Usage:
 *   const { userId, agencyId, role } = await requireSessionUser()
 */
export async function requireSessionUser() {
  const userId = await requireAuthUserId()

  const userData = await getCachedUserRecord(userId)
  if (!userData) redirect(SIGN_IN_PATH)

  return { userId, agencyId: userData.agency_id, role: userData.role }
}

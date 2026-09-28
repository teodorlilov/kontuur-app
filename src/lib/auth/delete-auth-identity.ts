import 'server-only'

import type { AdminClient } from '@/lib/supabase/admin'

/**
 * The code GoTrue answers a delete of a login that no longer exists with: 404 `user_not_found`
 * from `loadUser` (supabase/auth, internal/api/admin.go), carried as `AuthApiError.code`
 * (node_modules/@supabase/auth-js/src/lib/fetch.ts `handleError`). Matched by code, never by
 * status: a malformed id is a 404 too, with `validation_failed`.
 */
const USER_NOT_FOUND = 'user_not_found'

/**
 * Delete one Supabase auth identity; the mirror of `createUserRecord`
 * (src/lib/auth/create-user-record.ts). A login with a `users` row cannot go first: `users.id`
 * references `auth.users` with no cascade (migration 00000000_baseline:991), so the caller deletes
 * that row before this runs.
 *
 * A login already gone counts as deleted (`USER_NOT_FOUND`). Never throws: any other failure is
 * logged under `context` and answered false, so the caller can say the login survived — a
 * surviving invitee can join nothing, while a surviving original signup gets a fresh, empty
 * workspace on their next visit (`provisionUserRecord`, src/lib/auth/provision-user-record.ts).
 */
export async function deleteAuthIdentity(
  admin: AdminClient,
  userId: string,
  context: string
): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (!error || error.code === USER_NOT_FOUND) return true
  console.error(`[${context}] could not delete the auth account ${userId}:`, error.message)
  return false
}

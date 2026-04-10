import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRecord } from '@/lib/auth/helpers'

/**
 * Returns the authenticated user for the current SSR request.
 * Memoized via React cache() — safe to call from layout and page in the
 * same request without duplicate getUser() network calls.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

/**
 * Returns the user's DB record (agency_id, role).
 * Memoized via React cache() — delegates query to getUserRecord() in helpers.ts.
 */
export const getCachedUserRecord = cache(async (userId: string) => {
  const supabase = await createServerSupabaseClient()
  return getUserRecord(supabase, userId)
})

/**
 * Validates the current session and returns the auth context.
 * Redirects to /login if unauthenticated. For use in Server Component pages.
 *
 * Usage:
 *   const { user, agencyId, role } = await requireSessionUser()
 */
export async function requireSessionUser() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const userData = await getCachedUserRecord(user.id)
  if (!userData) redirect('/login')

  return { user, agencyId: userData.agency_id, role: userData.role }
}

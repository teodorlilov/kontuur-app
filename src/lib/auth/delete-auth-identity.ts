import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Delete one person's Supabase auth identity, after their `users` row is gone — `users.id`
 * references `auth.users` with no cascade (migration 00000000_baseline:991), so the row must go
 * first. The mirror of `createUserRecord` (create-user-record.ts).
 *
 * Never throws and never fails the caller: by the time this runs, access is already gone, and a
 * failure leaves an orphaned identity that belongs to no workspace — logged under `context` so
 * the log line names who was removing whom. What that orphan costs is why the log matters: the
 * dashboard layout re-provisions a workspace for any signed-in identity that has no `users` row
 * (src/app/(dashboard)/layout.tsx:69-82), so a survivor of a workspace delete would get a fresh,
 * empty one on their next visit. Returns whether the identity is gone.
 */
export async function deleteAuthIdentity(
  admin: SupabaseClient<Database>,
  userId: string,
  context: string
): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (!error) return true
  console.error(
    `[${context}] user row deleted but auth account remains for ${userId}:`,
    error.message
  )
  return false
}

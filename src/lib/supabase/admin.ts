import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service role client — bypasses ALL Row-Level Security.
 * ONLY use when the operation genuinely cannot use the user-scoped client:
 *   - Creating records during signup/OAuth before a user session exists
 *   - Storage bucket operations that require service-role access
 * Always verify auth + ownership BEFORE calling admin operations.
 * Never import in client components.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials')
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

/**
 * The service-role client as an *untyped* `SupabaseClient`, for the composition-engine tables
 * (`brand_kits`, `post_visuals`, `brand_image_bank`, `feed_systems`, `client_feed_systems`,
 * `brand_kit_extractions`) that aren't in the generated `Database` types yet. One cast lives here
 * instead of being copy-pasted per file; drop it once `supabase gen types` covers those tables.
 */
export function createUntypedAdminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

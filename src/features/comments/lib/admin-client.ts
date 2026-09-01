import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * The admin client, loosely typed, for the one table `database.ts` does not know yet.
 *
 * `ig_comments` arrives in migration 20260837. Until that reaches prod and
 * `npm run db:types` regenerates, `.from('ig_comments')` does not typecheck against
 * the generated `Database` union — the same gap `sync-metrics.ts` lives with by
 * taking an untyped `SupabaseClient` parameter.
 *
 * ONE place to delete rather than a cast scattered through each caller, which is the
 * whole reason this file exists. After the regen: remove it, and point the two
 * callers back at `createAdminSupabaseClient()` directly.
 *
 * Admin rather than user-scoped for the same reason every other ig_ read is: these
 * tables are read and written by crons and by actions that have already proved
 * ownership themselves, and a user-scoped client silently returning zero rows is the
 * worst failure mode available.
 */
export function createCommentsAdminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SOCIAL_CONNECTION_SYNC_COLUMNS,
  type ClientSyncableConnection,
  type SyncableConnection,
} from '@/lib/queries/select-columns'

/** The connections a background sync works through, and how many roster rows it leaves out. */
interface SyncRoster {
  connections: ClientSyncableConnection[]
  /** Rows with no `client_id`, or whose workspace may not publish: skipped, never failed. */
  skipped: number
}

/**
 * The roster every background sync walks: the live connections (a token and an account id) on
 * `platforms` whose client is in `entitledClientIds`. The nightly metrics runs (`syncRoster`,
 * src/features/analytics/lib/shared/sync-shared.ts) and the comments run
 * (`syncAllClientComments`, src/features/comments/lib/sync-comments.ts) both read it here.
 *
 * A paused workspace's connection, and one with no `client_id` to file rows under, come back only
 * as the `skipped` count. A failed read throws, naming the networks.
 *
 * WHY as: the `SupabaseClient` parameter is untyped, so the projection does not infer; the two
 * `.not` filters are what make `SyncableConnection`'s credential columns non-null.
 */
export async function fetchSyncRoster(
  admin: SupabaseClient,
  {
    platforms,
    entitledClientIds,
  }: {
    /** The networks as `social_connections.platform` stores them. */
    platforms: readonly string[]
    /** Clients whose workspace may still publish, resolved once per tick by the cron. */
    entitledClientIds: ReadonlySet<string>
  }
): Promise<SyncRoster> {
  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_SYNC_COLUMNS)
    .in('platform', platforms)
    .not('access_token', 'is', null)
    .not('account_id', 'is', null)
  if (error) {
    throw new Error(`${platforms.join(', ')} connection roster query failed: ${error.message}`)
  }
  const roster = (data ?? []) as SyncableConnection[]
  const connections = roster.filter(
    (c): c is ClientSyncableConnection => c.client_id !== null && entitledClientIds.has(c.client_id)
  )
  return { connections, skipped: roster.length - connections.length }
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Store the connection an OAuth flow just produced — the ONE writer of that operation.
 *
 * Three flows produce a connection and all three mean the same thing by it: Instagram Business
 * Login, the Facebook user token that lists a person's Pages, and the Page a user then picks.
 * They differ in what they connect, not in how it is recorded, so they share the write. Without
 * this each would carry its own upsert and its own conflict target, which is how the same row
 * comes to be written two ways.
 *
 * The other writers of `social_connections` are untouched: rotating a token, retiring one the
 * platform has killed, disconnecting, and stamping sync health are genuinely different
 * operations with their own owners.
 */
export interface StoredConnection {
  /** `client_id` for an account a client publishes to; null for a user-scoped token. */
  clientId: string | null
  /** Set only for user-scoped rows, which belong to a person rather than a client. */
  userId?: string | null
  platform: string
  accountId: string
  accountName: string
  accessToken: string
  /**
   * When the token dies, or null for one that does not.
   *
   * Null is meaningful, not missing: `token-expiry.ts` already reads it as "never expires", and
   * a Facebook Page token derived from a long-lived user token has no expiry — `/me/accounts`
   * returns it with no expiry field at all (see docs/META-FB-PROBE.md).
   */
  tokenExpiresAt: string | null
}

/**
 * Two conflict targets, because there are two kinds of row.
 *
 * A client-scoped connection is unique per (client, platform); a user-scoped one per (user,
 * platform), and its `client_id` is NULL — which also makes it invisible to RLS, so it is
 * admin-only by construction and every read of it keeps its platform filter. Canva already
 * stores a user-scoped row this way.
 */
export async function storeConnection(
  admin: SupabaseClient,
  connection: StoredConnection
): Promise<void> {
  const { error } = await admin.from('social_connections').upsert(
    {
      client_id: connection.clientId,
      user_id: connection.userId ?? null,
      platform: connection.platform,
      account_id: connection.accountId,
      account_name: connection.accountName,
      access_token: connection.accessToken,
      token_expires_at: connection.tokenExpiresAt,
    },
    { onConflict: connection.clientId ? 'client_id,platform' : 'user_id,platform' }
  )
  if (error) {
    throw new Error(`Failed to save ${connection.platform} connection: ${error.message}`)
  }
}

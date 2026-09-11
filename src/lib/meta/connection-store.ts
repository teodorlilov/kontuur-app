import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { notify } from '@/lib/notifications/notify'
import { PLATFORM_NAMES, toPublishingPlatform } from '@/lib/validation'

/**
 * Store the connection an OAuth flow just produced — the ONE writer of that operation.
 *
 * Three flows produce a connection and all three mean the same thing by it: Instagram Business
 * Login, the Facebook user token that lists a person's Pages, and the Page a user then picks.
 * They differ in what they connect, not in how it is recorded, so they share the write. Without
 * this each would carry its own upsert and its own conflict target, which is how the same row
 * comes to be written two ways.
 *
 * A successful connect also ends a retirement and clears the last sync verdict: `retired_at` and
 * `retired_reason` (migration 20260850) go back to null so the reconnect prompt and the roster
 * stop reporting the dead token, and `last_sync_error` goes back to null because the row's last
 * recorded failure was the dead token itself — left in place it would make the analytics sync
 * line read "did not finish … retrying tonight" on an account that was just reconnected.
 * `last_sync_at` is kept: a null there reads as "more than two nights ago".
 *
 * The other writers of `social_connections` are untouched: rotating a token, disconnecting, and
 * stamping sync health are genuinely different operations with their own owners.
 */
interface StoredConnection {
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
      retired_at: null,
      retired_reason: null,
      last_sync_error: null,
    },
    { onConflict: connection.clientId ? 'client_id,platform' : 'user_id,platform' }
  )
  if (error) {
    throw new Error(`Failed to save ${connection.platform} connection: ${error.message}`)
  }
}

/**
 * Retire a connection Meta has declared dead — the ONE writer of that operation.
 *
 * A Graph `token_invalid` answer (code 190 family, `graph-errors.ts`) means nothing but a
 * reconnect will ever fix this credential. Nulling the token is what every reader already treats
 * as "needs reconnecting": the publish preflight fails the destination without calling Meta
 * (`publish-post.ts` `connectionBlocker` — each tick still spends an attempt, the ladder is
 * unchanged), the nightly and half-hourly syncs skip the row, and the calendar and review pages
 * drop the network. `retired_at` is the non-secret fact the roster, the client settings and the
 * reconnect prompt read (migration 20260850); `retired_reason` keeps Meta's message for support
 * and nothing renders it.
 *
 * Called from every path that recognises the 190 — `sync-shared.ts` `syncRoster`,
 * `sync-comments.ts` `syncAllClientComments`, `comment-actions.ts` `checkClientComments`,
 * `publish-post.ts` (both Graph catches), `report-actions.ts` `fillPeriodData` and
 * `refresh-tokens.ts` — so the moment the app learns a token is dead is the moment it stops
 * using it.
 *
 * Retire ONLY on `token_invalid`. A `permission` answer from `/insights` or the comments edge is
 * a missing scope on a token that still publishes; retiring it would break publishing to fix
 * analytics. Client-scoped rows only: the user-scoped `facebook_user` and `canva` rows have no
 * client and sit on none of the paths above.
 *
 * Order matters. The write comes first; the caches are expired next — `{ expire: 0 }`, not the
 * `'max'` the user-driven edits use, because `'max'` only marks the entry stale and the very
 * next load would still render the connection as live, while a retirement must be visible on the
 * refresh that follows it; the notification comes last, with a one-day cooldown because a second
 * retirement within a day is the same event and the default week would silence a real repeat.
 * Nothing here is caught: a failed write throws before any side effect, and `notify` throws only
 * on a failed cooldown check or client lookup, by which point the retirement has landed — the
 * caller is at a boundary and logs once either way.
 */
export async function retireConnection(
  admin: SupabaseClient,
  input: { clientId: string; platform: string; reason: string }
): Promise<void> {
  const { error } = await admin
    .from('social_connections')
    .update({
      access_token: null,
      retired_at: new Date().toISOString(),
      retired_reason: input.reason,
    })
    .eq('client_id', input.clientId)
    .eq('platform', input.platform)
  if (error) throw new Error(`retire failed for client ${input.clientId}: ${error.message}`)

  revalidateTag('agency-clients', { expire: 0 })

  const known = toPublishingPlatform(input.platform)
  const label = known ? PLATFORM_NAMES[known] : input.platform
  await notify(admin, {
    clientId: input.clientId,
    type: 'connection_retired',
    cooldownDays: 1,
    message: (name) => `${label} for ${name} stopped working — reconnect the account`,
  })
}

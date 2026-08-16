import 'server-only'

import { REFRESH_WINDOW_DAYS } from '@/lib/meta/token-expiry'
import { MS_PER_DAY } from '@/utils/constants'
import { igRefreshResponseSchema } from '@/lib/meta/schemas'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/** Suppress duplicate reconnect notifications for this long. */
const NOTIFY_COOLDOWN_DAYS = 7

interface ExpiringConnection {
  id: string
  client_id: string
  access_token: string
  token_expires_at: string | null
}

interface RefreshTokensResult {
  refreshed: number
  failed: number
  errors: string[]
}

/**
 * Keeps Instagram long-lived tokens alive.
 * IG tokens expire after ~60 days and must be refreshed via ig_refresh_token;
 * without this, every connection silently dies and scheduled posts start failing.
 * Facebook Page tokens (derived from a long-lived user token) do not expire.
 */
export async function refreshExpiringTokens(): Promise<RefreshTokensResult> {
  const admin = createAdminSupabaseClient()
  const results: RefreshTokensResult = { refreshed: 0, failed: 0, errors: [] }

  // FB Page tokens don't expire — clear the bogus 60-day expiries older
  // connect flows wrote, so the scheduler stops rejecting healthy connections.
  const { error: fbCleanupError } = await admin
    .from('social_connections')
    .update({ token_expires_at: null })
    .eq('platform', 'facebook')
    .not('token_expires_at', 'is', null)
  if (fbCleanupError) {
    results.errors.push(`facebook expiry cleanup failed: ${fbCleanupError.message}`)
  }

  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * MS_PER_DAY).toISOString()
  const { data, error: listError } = await admin
    .from('social_connections')
    .select('id, client_id, access_token, token_expires_at')
    .eq('platform', 'instagram')
    .not('access_token', 'is', null)
    .lte('token_expires_at', cutoff)
  // Without this the cron reports a clean run while every token drifts to expiry.
  if (listError) throw new Error(`expiring connection query failed: ${listError.message}`)

  // as: explicit column projection — Supabase types from the table, not the select
  for (const conn of (data as ExpiringConnection[] | null) ?? []) {
    try {
      // Timed: the loop is serial, so one stalled Meta call would otherwise
      // eat the whole cron budget and starve every connection behind it.
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.access_token}`,
        { signal: AbortSignal.timeout(15_000) }
      )
      // Parsed, not asserted: a shape change at Meta's end would otherwise write
      // `undefined` into access_token and silently break every connection.
      const parsed = igRefreshResponseSchema.safeParse(await res.json())
      if (!parsed.success) {
        results.failed++
        results.errors.push(`unrecognised refresh response for connection ${conn.id}`)
        continue
      }
      const body = parsed.data

      if (res.ok && body.access_token && body.expires_in) {
        const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
        const { error: writeError } = await admin
          .from('social_connections')
          .update({ access_token: body.access_token, token_expires_at: expiresAt })
          .eq('id', conn.id)
        // Meta issued a fresh token we failed to store: the old one keeps
        // counting down, so this is a failed refresh, not a successful one.
        if (writeError) {
          results.failed++
          results.errors.push(`token write failed for connection ${conn.id}: ${writeError.message}`)
        } else {
          results.refreshed++
        }
      } else {
        results.failed++
        results.errors.push(body.error?.message ?? `HTTP ${res.status}`)
        // Scoped catch: a failed notification is its own problem, and letting it
        // reach the outer handler would count this connection as failed twice.
        try {
          await notifyReconnectNeeded(admin, conn.client_id)
        } catch (notifyErr) {
          results.errors.push(
            notifyErr instanceof Error ? notifyErr.message : 'reconnect notification failed'
          )
        }
      }
    } catch (err) {
      results.failed++
      results.errors.push(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return results
}

/** Tell the agency a connection needs manual reconnection, at most once per cooldown. */
async function notifyReconnectNeeded(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  clientId: string
): Promise<void> {
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('name, agency_id')
    .eq('id', clientId)
    .maybeSingle()
  if (clientError) throw new Error(`client lookup failed: ${clientError.message}`)
  if (!client?.agency_id) return

  const message = `Instagram connection for ${client.name} could not be refreshed — please reconnect the account`

  const since = new Date(Date.now() - NOTIFY_COOLDOWN_DAYS * MS_PER_DAY).toISOString()
  const { data: existing, error: existingError } = await admin
    .from('notifications')
    .select('id')
    .eq('agency_id', client.agency_id)
    .eq('message', message)
    .gte('created_at', since)
    .limit(1)
  // Reading the cooldown as "none sent" would re-notify on every cron tick.
  if (existingError) throw new Error(`notification cooldown check failed: ${existingError.message}`)
  if (existing && existing.length > 0) return

  const { error: insertError } = await admin.from('notifications').insert({
    agency_id: client.agency_id,
    client_id: clientId,
    message,
  })
  if (insertError) throw new Error(`reconnect notification insert failed: ${insertError.message}`)
}

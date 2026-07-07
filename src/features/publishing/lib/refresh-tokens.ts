import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/** Refresh Instagram tokens expiring within this window on each daily run. */
const REFRESH_WINDOW_DAYS = 14
/** Suppress duplicate reconnect notifications for this long. */
const NOTIFY_COOLDOWN_DAYS = 7

interface IGRefreshResponse {
  access_token?: string
  expires_in?: number
  error?: { message?: string }
}

interface ExpiringConnection {
  id: string
  client_id: string
  access_token: string
  token_expires_at: string | null
}

export interface RefreshTokensResult {
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
  await admin
    .from('social_connections')
    .update({ token_expires_at: null })
    .eq('platform', 'facebook')
    .not('token_expires_at', 'is', null)

  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * 86_400_000).toISOString()
  const { data } = await admin
    .from('social_connections')
    .select('id, client_id, access_token, token_expires_at')
    .eq('platform', 'instagram')
    .not('access_token', 'is', null)
    .lte('token_expires_at', cutoff)

  for (const conn of (data as ExpiringConnection[] | null) ?? []) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.access_token}`
      )
      const body = (await res.json()) as IGRefreshResponse

      if (res.ok && body.access_token && body.expires_in) {
        const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
        await admin
          .from('social_connections')
          .update({ access_token: body.access_token, token_expires_at: expiresAt })
          .eq('id', conn.id)
        results.refreshed++
      } else {
        results.failed++
        results.errors.push(body.error?.message ?? `HTTP ${res.status}`)
        await notifyReconnectNeeded(admin, conn.client_id)
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
  const { data: client } = await admin
    .from('clients')
    .select('name, agency_id')
    .eq('id', clientId)
    .single()
  if (!client?.agency_id) return

  const message = `Instagram connection for ${client.name} could not be refreshed — please reconnect the account`

  const since = new Date(Date.now() - NOTIFY_COOLDOWN_DAYS * 86_400_000).toISOString()
  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('agency_id', client.agency_id)
    .eq('message', message)
    .gte('created_at', since)
    .limit(1)
  if (existing && existing.length > 0) return

  await admin.from('notifications').insert({
    agency_id: client.agency_id,
    client_id: clientId,
    message,
  })
}

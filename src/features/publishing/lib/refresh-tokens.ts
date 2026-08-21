import 'server-only'

import { REFRESH_WINDOW_DAYS } from '@/lib/meta/token-expiry'
import { MS_PER_DAY } from '@/utils/constants'
import { IG_TOKEN_REFRESH_URL } from '@/lib/meta/constants'
import { classifyGraphError, type GraphFailure } from '@/lib/meta/graph-errors'
import { igRefreshResponseSchema } from '@/lib/meta/schemas'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { notifyAboutClient } from './notifications'

interface ExpiringConnection {
  id: string
  client_id: string
  access_token: string
  token_expires_at: string | null
}

interface RefreshTokensResult {
  refreshed: number
  failed: number
  /** Connections whose token Meta rejected outright — retired, reconnect required. */
  retired: number
  errors: string[]
}

/**
 * Does this refresh failure mean the credential is dead?
 *
 * The whole branch hangs off this, and both halves matter. A dead token must be
 * retired and the agency told, because nothing resolves it but a reconnect. A
 * transient or rate-limited answer must do NEITHER: the token is fine, tomorrow
 * fixes it, and telling someone to reconnect a working account is a false alarm
 * they cannot act on.
 */
export function isTokenRetirable(failure: GraphFailure): boolean {
  return failure === 'token_invalid' || failure === 'permission'
}

/**
 * Keeps Instagram long-lived tokens alive.
 * IG tokens expire after ~60 days and must be refreshed via ig_refresh_token;
 * without this, every connection silently dies and scheduled posts start failing.
 *
 * A token Meta declares invalid (code 190 family) is RETIRED — access_token
 * nulled so the publish preflight reports "needs reconnecting" instead of
 * hammering Meta with a dead credential on every subsequent run.
 */
export async function refreshExpiringTokens(): Promise<RefreshTokensResult> {
  const admin = createAdminSupabaseClient()
  const results: RefreshTokensResult = { refreshed: 0, failed: 0, retired: 0, errors: [] }

  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * MS_PER_DAY).toISOString()
  const { data, error: listError } = await admin
    .from('social_connections')
    .select('id, client_id, access_token, token_expires_at')
    .eq('platform', 'instagram')
    .not('access_token', 'is', null)
    // NULL expiry rows are included: an IG connection stored without an expiry
    // would otherwise never be refreshed and die silently at day 60.
    .or(`token_expires_at.is.null,token_expires_at.lte.${cutoff}`)
  // Without this the cron reports a clean run while every token drifts to expiry.
  if (listError) throw new Error(`expiring connection query failed: ${listError.message}`)

  // as: explicit column projection — Supabase types from the table, not the select
  for (const conn of (data as ExpiringConnection[] | null) ?? []) {
    try {
      // Timed: the loop is serial, so one stalled Meta call would otherwise
      // eat the whole cron budget and starve every connection behind it.
      // Token in the query string is this endpoint's documented contract —
      // ig_refresh_token takes the token as its grant parameter.
      const res = await fetch(
        `${IG_TOKEN_REFRESH_URL}?grant_type=ig_refresh_token&access_token=${conn.access_token}`,
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
        continue
      }

      const failure = classifyGraphError({
        httpStatus: res.status,
        code: body.error?.code ?? null,
        subcode: null,
        type: null,
        message: body.error?.message ?? `HTTP ${res.status}`,
        fbtraceId: null,
      })

      if (isTokenRetirable(failure)) {
        // Retire the credential: keeping a dead token makes every publish and
        // metrics call fail with the same 190 until someone reconnects.
        const { error: retireError } = await admin
          .from('social_connections')
          .update({ access_token: null })
          .eq('id', conn.id)
        if (retireError) {
          results.errors.push(
            `token retire failed for connection ${conn.id}: ${retireError.message}`
          )
        }
        results.retired++
        results.errors.push(body.error?.message ?? `HTTP ${res.status}`)

        // Only a retired credential earns the alert. It used to fire here for
        // every failure, so a Meta 500 or a rate limit told the agency their
        // connection was broken and asked them to reconnect a token that was
        // fine and would refresh on its own tomorrow.
        //
        // Scoped catch: a failed notification is its own problem, and letting
        // it reach the outer handler would count this connection twice.
        try {
          await notifyReconnectNeeded(admin, conn.client_id)
        } catch (notifyErr) {
          results.errors.push(
            notifyErr instanceof Error ? notifyErr.message : 'reconnect notification failed'
          )
        }
      } else {
        // Transient / rate-limited: leave the token for tomorrow's run, and say
        // nothing — there is nothing for anyone to do about it.
        results.failed++
        results.errors.push(body.error?.message ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      results.failed++
      results.errors.push(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return results
}

/** Tell the agency a connection needs manual reconnection, at most once per cooldown. */
function notifyReconnectNeeded(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  clientId: string
): Promise<void> {
  return notifyAboutClient(
    admin,
    clientId,
    (name) =>
      `Instagram connection for ${name} could not be refreshed — please reconnect the account`
  )
}

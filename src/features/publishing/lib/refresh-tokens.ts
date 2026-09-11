import 'server-only'

import { REFRESH_WINDOW_DAYS } from '@/lib/meta/token-expiry'
import { MS_PER_DAY } from '@/utils/constants'
import { IG_TOKEN_REFRESH_URL } from '@/lib/meta/constants'
import { classifyGraphError, type GraphFailure } from '@/lib/meta/graph-errors'
import { igRefreshResponseSchema } from '@/lib/meta/schemas'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { retireConnection } from '@/lib/meta/connection-store'
import type { SocialConnectionRow } from '@/types'

/** Derived; both non-null narrowings are the query's own `.not(…, 'is', null)` filters. */
type ExpiringConnection = Pick<
  SocialConnectionRow,
  'id' | 'client_id' | 'access_token' | 'token_expires_at'
> & { access_token: string; client_id: string }

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
 * A token Meta declares invalid is retired through `retireConnection`. `isTokenRetirable`
 * widens that to `permission` here, and only here: the refresh endpoint's answer is about the
 * token itself, unlike a scope error on `/insights`.
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
    .not('client_id', 'is', null)
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
        try {
          await retireConnection(admin, {
            clientId: conn.client_id,
            platform: 'instagram',
            reason: body.error?.message ?? `HTTP ${res.status}`,
          })
          results.retired++
        } catch (retireErr) {
          results.errors.push(
            retireErr instanceof Error ? retireErr.message : `retire failed for ${conn.id}`
          )
        }
        results.errors.push(body.error?.message ?? `HTTP ${res.status}`)
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

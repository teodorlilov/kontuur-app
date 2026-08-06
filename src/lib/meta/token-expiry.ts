/**
 * One definition of what "expired" and "expiring" mean for a stored OAuth token.
 *
 * A NULL expiry means "never expires", NOT "expired". Facebook Page tokens are
 * deliberately nulled by refreshExpiringTokens() — Page tokens derived from a
 * long-lived user token do not expire — so reading NULL as expired would mark
 * every healthy Facebook connection as broken.
 *
 * This is the only definition — the publish cron, the research pipeline, the API
 * routes and the connected-accounts tab all import it. Anything that needs to
 * know whether a stored token is usable belongs here, so the publish path and
 * the UI can never disagree about what "expired" means.
 *
 * Canva is NOT a candidate for consolidation. src/app/api/canva/canva-auth.ts
 * inverts these semantics — Canva tokens genuinely expire and carry a
 * refresh_token, so a NULL expiry there means "refresh before use".
 */

import { MS_PER_DAY } from '@/utils/constants'

/** Refresh Instagram tokens expiring within this window on each daily run. */
export const REFRESH_WINDOW_DAYS = 14

/**
 * Has the token already lapsed?
 *
 * An unparseable timestamp yields NaN, and every NaN comparison is false, so a
 * malformed value reads as "not expired". That is the safe direction: a parse
 * error should not tear down a connection that may well be working.
 */
export function isTokenExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < now.getTime()
}

/**
 * Will the token lapse within the refresh window, but has not lapsed yet?
 *
 * Strictly forward-looking — an already-expired token is a worse state, not this
 * one, and callers that need to rank the two should test isTokenExpired first.
 */
export function isTokenExpiring(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  return remaining >= 0 && remaining <= REFRESH_WINDOW_DAYS * MS_PER_DAY
}

/**
 * Whole days until the token lapses, for copy like "expires in 6 days".
 * Rounds up, so a token with any time left today reads as 1 rather than 0.
 * Returns null when there is no expiry to count down to.
 */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  if (Number.isNaN(remaining)) return null
  return Math.ceil(remaining / MS_PER_DAY)
}

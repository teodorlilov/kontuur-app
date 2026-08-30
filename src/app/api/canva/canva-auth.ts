import { cache } from 'react'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { CANVA_TOKEN_URL } from './canva-constants'

interface CanvaTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * One holder per user per REQUEST, so a token is fetched once however many times it is asked for.
 *
 * `cache` memoizes on the argument for the life of one request, so this returns the same mutable
 * object to every call in that request — which is what lets a refresh update it rather than just
 * skipping a read. A plain memo of the DB read would go stale the moment the token was refreshed.
 *
 * The export route is why this exists: it polls Canva up to fifteen times in one thirty-second
 * request, `canvaFetch` asks for the token on each of them, and every ask was a full read of the
 * same `social_connections` row — sixteen identical queries to answer one question whose answer is
 * valid for the whole window.
 */
const requestToken = cache((_userId: string): { value: string | null } => ({ value: null }))

/**
 * Retrieve a valid Canva access token for a user (manager).
 * If the token is expired or forceRefresh is true, refreshes it automatically.
 * Returns null if no Canva connection exists for the user.
 */
export async function getCanvaToken(userId: string, forceRefresh = false): Promise<string | null> {
  const held = requestToken(userId)
  // A force refresh is the 401 path — the held token is precisely what was just rejected.
  if (!forceRefresh && held.value) return held.value

  const admin = createAdminSupabaseClient()
  const { data: conn } = await admin
    .from('social_connections')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', 'canva')
    .single()

  if (!conn?.access_token) return null

  // Token still valid and no force refresh — use it directly
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null
  if (!forceRefresh && expiresAt && expiresAt > new Date()) {
    held.value = conn.access_token
    return conn.access_token
  }

  // Token expired or revoked — refresh it
  if (!conn.refresh_token) return null

  const credentials = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString('base64')

  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', conn.refresh_token)

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    console.error('Canva token refresh failed:', await res.text())
    return null
  }

  const tokens = (await res.json()) as CanvaTokenResponse
  const newExpiry = new Date()
  newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in)

  await admin
    .from('social_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: newExpiry.toISOString(),
    })
    .eq('id', conn.id)

  held.value = tokens.access_token
  return tokens.access_token
}

/**
 * Make an authenticated fetch to the Canva API.
 * If Canva returns 401 (revoked/invalid token), automatically refreshes
 * the token and retries once.
 */
export async function canvaFetch(
  userId: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  let token = await getCanvaToken(userId)
  if (!token) throw new CanvaAuthError('Canva not connected')

  const doFetch = (t: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${t}`,
      },
    })

  const res = await doFetch(token)

  // If 401 — token may be revoked. Force refresh and retry once.
  if (res.status === 401) {
    token = await getCanvaToken(userId, true)
    if (!token) throw new CanvaAuthError('Canva not connected')
    return doFetch(token)
  }

  return res
}

export class CanvaAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvaAuthError'
  }
}

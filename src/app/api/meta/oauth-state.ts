import { createHmac, timingSafeEqual } from 'crypto'
import { isOAuthPlatform, type OAuthPlatform } from '@/lib/meta/oauth-networks'

/**
 * HMAC-signed OAuth state for the Meta connect/callback flow.
 * Prevents forged callbacks from attaching a social account to an arbitrary client:
 * the callback only accepts state values we issued, and they expire after 15 minutes.
 */

const STATE_TTL_MS = 15 * 60 * 1000

/**
 * `platform` says which network's consent this state was issued for, and the callback dispatches
 * on it. It was pinned to the literal 'instagram' — which meant a second network could not be
 * added without editing the type, the guard below and the connect route in step.
 */
interface OAuthStatePayload {
  clientId: string
  platform: OAuthPlatform
}

function stateSecret(): string {
  const secret = process.env.META_APP_SECRET
  if (!secret) throw new Error('META_APP_SECRET is not set')
  return secret
}

function sign(payload: string): Buffer {
  return createHmac('sha256', stateSecret()).update(payload).digest()
}

export function encodeOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })).toString(
    'base64url'
  )
  return `${body}.${sign(body).toString('base64url')}`
}

/** Returns the payload if the signature is valid and the state has not expired, else null. */
export function decodeOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split('.')
  if (!body || !sig) return null

  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  const expected = sign(body)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      clientId?: string
      platform?: string
      exp?: number
    }
    if (!decoded.clientId || !decoded.exp || Date.now() > decoded.exp) return null
    // A platform this app does not connect must fail rather than fall through to a flow that
    // was never issued for it.
    if (!decoded.platform || !isOAuthPlatform(decoded.platform)) return null
    return { clientId: decoded.clientId, platform: decoded.platform }
  } catch {
    return null
  }
}

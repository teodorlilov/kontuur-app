import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_SECONDS = 120

function secret(): string {
  const value = process.env.RENDER_TOKEN_SECRET
  if (!value) throw new Error('RENDER_TOKEN_SECRET is not set')
  return value
}

/**
 * Mint a short-lived render token scoped to one `post_visuals` id — HMAC-SHA256 over
 * `{pv, exp}`, encoded `payload.signature` (both base64url). Server-only; never exposed to the
 * browser. The render service passes it back to the `/render` route, which verifies before loading.
 */
export function signRenderToken(postVisualId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const payload = Buffer.from(JSON.stringify({ pv: postVisualId, exp: Date.now() + ttlSeconds * 1000 })).toString(
    'base64url'
  )
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

/** Verify a render token: signature, expiry, and that it is scoped to this `post_visuals` id. */
export function verifyRenderToken(token: string, postVisualId: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, signature] = parts
  if (!payload || !signature) return false
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url')
  if (!constantTimeEqual(signature, expected)) return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { pv?: unknown; exp?: unknown }
    return parsed.pv === postVisualId && typeof parsed.exp === 'number' && parsed.exp > Date.now()
  } catch {
    return false
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

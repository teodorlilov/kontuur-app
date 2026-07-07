import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { encodeOAuthState, decodeOAuthState } from '../oauth-state'

beforeAll(() => {
  process.env.META_APP_SECRET = 'test-secret'
})

describe('oauth-state', () => {
  it('round-trips a valid payload', () => {
    const state = encodeOAuthState({ clientId: 'client-123', platform: 'instagram' })
    expect(decodeOAuthState(state)).toEqual({ clientId: 'client-123', platform: 'instagram' })
  })

  it('rejects a tampered payload', () => {
    const state = encodeOAuthState({ clientId: 'client-123', platform: 'instagram' })
    const [, sig] = state.split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ clientId: 'victim-456', platform: 'instagram', exp: Date.now() + 60_000 })
    ).toString('base64url')
    expect(decodeOAuthState(`${forgedBody}.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const state = encodeOAuthState({ clientId: 'client-123', platform: 'facebook' })
    const [body] = state.split('.')
    expect(decodeOAuthState(`${body}.AAAA`)).toBeNull()
  })

  it('rejects the legacy unsigned format', () => {
    const legacy = Buffer.from(
      JSON.stringify({ clientId: 'client-123', platform: 'instagram' })
    ).toString('base64url')
    expect(decodeOAuthState(legacy)).toBeNull()
  })

  it('rejects an expired state', () => {
    const state = encodeOAuthState({ clientId: 'client-123', platform: 'instagram' })
    const [body] = state.split('.')
    const decoded = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as {
      exp: number
    }
    // Re-encode with an expired timestamp using the real signer via a time shim is overkill;
    // instead assert the exp field exists and is in the future, and that a stale body fails.
    expect(decoded.exp).toBeGreaterThan(Date.now())

    const staleBody = Buffer.from(
      JSON.stringify({ clientId: 'client-123', platform: 'instagram', exp: Date.now() - 1000 })
    ).toString('base64url')
    // Signed correctly but expired — build the signature with the same secret
    const sig = createHmac('sha256', 'test-secret').update(staleBody).digest('base64url')
    expect(decodeOAuthState(`${staleBody}.${sig}`)).toBeNull()
  })

  it('rejects an unknown platform even when signed', () => {
    const body = Buffer.from(
      JSON.stringify({ clientId: 'client-123', platform: 'tiktok', exp: Date.now() + 60_000 })
    ).toString('base64url')
    const sig = createHmac('sha256', 'test-secret').update(body).digest('base64url')
    expect(decodeOAuthState(`${body}.${sig}`)).toBeNull()
  })
})

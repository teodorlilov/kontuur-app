import { beforeAll, describe, expect, it } from 'vitest'
import { signRenderToken, verifyRenderToken } from '../token'

beforeAll(() => {
  process.env.RENDER_TOKEN_SECRET = 'test-secret'
})

describe('render token', () => {
  it('verifies a freshly signed token for the same id', () => {
    expect(verifyRenderToken(signRenderToken('pv-1'), 'pv-1')).toBe(true)
  })

  it('rejects a token minted for a different post_visuals id', () => {
    expect(verifyRenderToken(signRenderToken('pv-1'), 'pv-2')).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const [payload] = signRenderToken('pv-1').split('.')
    const forged = `${payload}.${'A'.repeat(43)}`
    expect(verifyRenderToken(forged, 'pv-1')).toBe(false)
  })

  it('rejects an expired token', () => {
    expect(verifyRenderToken(signRenderToken('pv-1', -1), 'pv-1')).toBe(false)
  })

  it('rejects a malformed token', () => {
    expect(verifyRenderToken('nonsense', 'pv-1')).toBe(false)
  })
})

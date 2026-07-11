import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { parseBrandTokens, safeParseBrandTokens } from '../tokens-schema'

describe('brandTokensSchema', () => {
  it('accepts the default kit', () => {
    expect(() => parseBrandTokens(DEFAULT_TOKENS)).not.toThrow()
  })

  it('rejects a kit missing a colour role (accent)', () => {
    const { accent: _dropped, ...color } = DEFAULT_TOKENS.color
    expect(safeParseBrandTokens({ ...DEFAULT_TOKENS, color }).success).toBe(false)
  })

  it('rejects a non-positive scale', () => {
    const tokens = { ...DEFAULT_TOKENS, type: { ...DEFAULT_TOKENS.type, scale: 0 } }
    expect(safeParseBrandTokens(tokens).success).toBe(false)
  })

  it('rejects a completely wrong shape', () => {
    expect(safeParseBrandTokens({ nope: true }).success).toBe(false)
  })

  it('reports readable issue paths', () => {
    const result = safeParseBrandTokens({ ...DEFAULT_TOKENS, grid: {} })
    if (result.success) throw new Error('expected the invalid grid to fail')
    expect(result.issues.join(' ')).toMatch(/grid/)
  })
})

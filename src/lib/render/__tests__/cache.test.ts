import { describe, expect, it } from 'vitest'
import { isCacheHit, type PostVisual } from '../cache'
import { renderHash } from '../hash'

const composition = { id: 'c1', layers: [{ type: 'text', slot: 'headline' }] }

function row(overrides: Partial<PostVisual>): PostVisual {
  return {
    composition_json: composition,
    brand_kit_version: 1,
    render_hash: null,
    rendered_url: null,
    ...overrides,
  }
}

describe('isCacheHit', () => {
  it('hits when the stored hash matches and a PNG url exists (unchanged slide → no re-render)', () => {
    const hash = renderHash(composition, 1)
    expect(isCacheHit(row({ render_hash: hash, rendered_url: 'https://x/y.png' }), hash)).toBe(true)
  })

  it('misses when the hash matches but no PNG was ever uploaded', () => {
    const hash = renderHash(composition, 1)
    expect(isCacheHit(row({ render_hash: hash, rendered_url: null }), hash)).toBe(false)
  })

  it('misses when the composition changed (one-property edit → exactly one re-render)', () => {
    const staleHash = renderHash(composition, 1)
    const freshHash = renderHash({ ...composition, id: 'c2' }, 1)
    expect(isCacheHit(row({ render_hash: staleHash, rendered_url: 'https://x/y.png' }), freshHash)).toBe(false)
  })

  it('misses when only the brand-kit version bumped (rebrand → re-render, no silent no-op)', () => {
    const staleHash = renderHash(composition, 1)
    const freshHash = renderHash(composition, 2)
    expect(isCacheHit(row({ render_hash: staleHash, rendered_url: 'https://x/y.png' }), freshHash)).toBe(false)
  })
})

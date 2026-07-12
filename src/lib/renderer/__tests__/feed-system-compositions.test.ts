import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS, validateShareableComposition } from '@/lib/scene-graph'
import { Composition } from '../Composition'
import { REFERENCE_MARKS } from '../reference-compositions'
import {
  FEED_SYSTEM_PACKS,
  feedSystemCompositions,
  feedSystemPack,
  feedSystemTokens,
  type FeedSystemSlug,
} from '../feed-system-compositions'

const packs = Object.entries(FEED_SYSTEM_PACKS) as [FeedSystemSlug, Record<string, import('@/lib/scene-graph').Composition>][]
const allCompositions = packs.flatMap(([slug, pack]) => Object.entries(pack).map(([role, c]) => [`${slug}/${role}`, c] as const))

describe('feed-system composition packs', () => {
  it('has all three systems, each covering the five roles', () => {
    expect(Object.keys(FEED_SYSTEM_PACKS).sort()).toEqual(['bold-blocks', 'editorial', 'quiet-grid'])
    for (const [, pack] of packs) {
      expect(Object.keys(pack).sort()).toEqual(['cover', 'cta', 'list', 'quote', 'statement'])
    }
  })

  it.each(allCompositions)('%s is a valid shareable composition (no hex, no literal family)', (_id, composition) => {
    expect(validateShareableComposition(composition)).toEqual([])
  })

  it.each(allCompositions)('%s renders without throwing — every token binding resolves', (_id, composition) => {
    expect(() =>
      renderToStaticMarkup(createElement(Composition, { composition, tokens: DEFAULT_TOKENS, marks: REFERENCE_MARKS }))
    ).not.toThrow()
  })

  it('every layer id within a composition is unique', () => {
    for (const [id, composition] of allCompositions) {
      const ids = composition.layers.map((l) => l.id)
      expect(new Set(ids).size, `${id} has duplicate layer ids`).toBe(ids.length)
    }
  })

  it('the systems are visually distinct — bold-blocks/quiet-grid do not clone editorial', () => {
    const editorial = JSON.stringify(feedSystemPack('editorial'))
    expect(JSON.stringify(feedSystemPack('bold-blocks'))).not.toBe(editorial)
    expect(JSON.stringify(feedSystemPack('quiet-grid'))).not.toBe(editorial)
  })

  it('falls back to editorial for an unknown or null slug', () => {
    expect(feedSystemPack('nope')).toBe(FEED_SYSTEM_PACKS.editorial)
    expect(feedSystemPack(null)).toBe(FEED_SYSTEM_PACKS.editorial)
    expect(feedSystemCompositions('nope').map((c) => c.id)).toEqual(feedSystemCompositions('editorial').map((c) => c.id))
  })

  it('feedSystemTokens merges the needed weights without dropping the kit weights or changing colour/family', () => {
    const bold = feedSystemTokens('bold-blocks', DEFAULT_TOKENS)
    expect(bold.color).toEqual(DEFAULT_TOKENS.color)
    expect(bold.type.display.family).toBe(DEFAULT_TOKENS.type.display.family)
    // keeps the kit's own weights…
    expect(bold.type.display.weights).toEqual(expect.arrayContaining(DEFAULT_TOKENS.type.display.weights))
    // …and adds the heavy weights bold-blocks reaches for, sorted + de-duped
    expect(bold.type.display.weights).toContain(800)
    expect(bold.type.display.weights).toContain(900)
    expect([...bold.type.display.weights]).toEqual([...bold.type.display.weights].sort((a, b) => a - b))
    expect(new Set(bold.type.display.weights).size).toBe(bold.type.display.weights.length)

    const quiet = feedSystemTokens('quiet-grid', DEFAULT_TOKENS)
    expect(quiet.type.body.weights).toContain(300)
  })
})

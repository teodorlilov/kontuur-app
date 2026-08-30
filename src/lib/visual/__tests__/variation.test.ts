import { describe, it, expect } from 'vitest'
import { artDirectionFor, variantIndex, type VariationKey } from '../variation'
import { BRAND_STYLES, BRAND_STYLE_IDS, getBrandStyle } from '../brand-styles'
import { expectColorFree } from './color-words'

const POSTER = getBrandStyle('hyperreal-poster')

const key = (over: Partial<VariationKey> = {}): VariationKey => ({
  subject: 'post-1',
  position: 0,
  total: 3,
  nonce: '',
  ...over,
})

describe('variantIndex', () => {
  it('is stable for the same slide and attempt', () => {
    expect(variantIndex(key(), 8, 'subject')).toBe(variantIndex(key(), 8, 'subject'))
  })

  it('changes when the slide is regenerated', () => {
    const first = variantIndex(key({ nonce: '' }), 8, 'subject')
    const rerolls = ['img-a', 'img-b', 'img-c', 'img-d'].map((nonce) =>
      variantIndex(key({ nonce }), 8, 'subject')
    )
    expect(rerolls.some((index) => index !== first)).toBe(true)
  })

  it('differs between slides of one post', () => {
    const indexes = [0, 1, 2, 3].map((position) => variantIndex(key({ position }), 8, 'subject'))
    expect(new Set(indexes).size).toBeGreaterThan(1)
  })

  // Without the axis both questions hash the same string, so every framing would arrive welded to
  // one treatment — six combinations pretending to be thirty-six.
  it('decorrelates axes so framing and treatment do not move in lockstep', () => {
    const pairs = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (position) =>
        `${variantIndex(key({ position }), 6, 'framing')}-${variantIndex(key({ position }), 6, 'treatment')}`
    )
    expect(new Set(pairs).size).toBeGreaterThan(2)
  })

  it('never divides by zero on an empty catalogue', () => {
    expect(variantIndex(key(), 0)).toBe(0)
  })
})

describe('artDirectionFor', () => {
  it('directs the cover', () => {
    expect(artDirectionFor(key({ position: 0, total: 4 }), POSTER)).toContain('Shoot it this way')
  })

  it('directs rich middle slides', () => {
    expect(artDirectionFor(key({ position: 2, total: 5 }), POSTER)).not.toBeNull()
  })

  /**
   * The regression this whole axis was rebuilt to prevent.
   *
   * Art direction used to choose the SUBJECT — a marble bust, a crowd seen from above — and because
   * it lands as the last concrete sentence of the prompt it beat the copy. A slide reading "without
   * this document the sale stops" came back as an aerial crowd. Direction may say how to shoot;
   * what is in the frame belongs to the post.
   */
  it('never says what to put in the picture', () => {
    const nouns = [
      'portrait',
      'animal',
      'sculpture',
      'bust',
      'building',
      'crowd',
      'hand',
      'skin',
      'product',
      'produce',
      'botanical',
      'diagram',
      'sketch',
      'object',
      'figure',
      'face',
    ]
    for (const id of BRAND_STYLE_IDS) {
      const style = BRAND_STYLES[id]
      for (const position of [0, 2, 4, 6]) {
        const said = artDirectionFor(key({ position, total: 9 }), style)
        if (!said) continue
        for (const noun of nouns) {
          expect(said.toLowerCase(), `${id} slide ${position}`).not.toContain(noun)
        }
      }
    }
  })

  it('hands the subject back to the copy, out loud', () => {
    expect(artDirectionFor(key({ position: 0, total: 4 }), POSTER)).toContain(
      'subject itself comes from the copy'
    )
  })

  // These two roles are already told to be restrained; a close crop in the same prompt would
  // contradict the role hint outright.
  it('stays silent on quiet middles and the closing slide', () => {
    expect(artDirectionFor(key({ position: 1, total: 5 }), POSTER)).toBeNull()
    expect(artDirectionFor(key({ position: 4, total: 5 }), POSTER)).toBeNull()
  })

  it('gives one post two different covers across regenerates', () => {
    const first = artDirectionFor(key({ nonce: '' }), POSTER)
    const again = ['a', 'b', 'c', 'd'].map((nonce) => artDirectionFor(key({ nonce }), POSTER))
    expect(again.some((direction) => direction !== first)).toBe(true)
  })
})

describe('per-style variation vocabulary', () => {
  it('never names a colour — the palette is the only colour source', () => {
    for (const id of BRAND_STYLE_IDS) {
      for (const framing of BRAND_STYLES[id].variation.framings) expectColorFree(framing, id)
      for (const treatment of BRAND_STYLES[id].variation.treatments) expectColorFree(treatment, id)
    }
  })

  /**
   * Thirty-six combinations per style, not six. One list of four gave four looks, and a three-draft
   * run repeated a look 38% of the time — small numbers, not a broken hash.
   */
  it('gives every style enough range that a screenful of covers cannot repeat', () => {
    for (const id of BRAND_STYLE_IDS) {
      const { framings, treatments } = BRAND_STYLES[id].variation
      expect(framings.length, id).toBeGreaterThanOrEqual(6)
      expect(treatments.length, id).toBeGreaterThanOrEqual(6)
      expect(new Set(framings).size, id).toBe(framings.length)
      expect(new Set(treatments).size, id).toBe(treatments.length)
    }
  })

  /**
   * The correction this file exists to lock in. A single global list was written while building
   * Hyperreal Poster, so it offered hard rim light and specular gloss to a skincare editorial and to
   * a paper-and-halftone collage system — a poster brief handed to systems that are not posters.
   */
  it('gives each style its own vocabulary rather than one shared list', () => {
    const lists = BRAND_STYLE_IDS.map((id) => {
      const { framings, treatments } = BRAND_STYLES[id].variation
      return [...framings, ...treatments].join('|')
    })
    expect(new Set(lists).size).toBe(BRAND_STYLE_IDS.length)
  })

  /**
   * A tone that suits one system wrecks another. Clinical Luxury on a deep ground is the navy-slab
   * regression; Graphic Editorial needs a light printed field for its collage to sit on. Asserted by
   * rung name rather than by hex, because the hexes belong to whichever client is being rendered.
   */
  it('keeps each style to grounds it can actually use', () => {
    const grounds = (id: keyof typeof BRAND_STYLES) =>
      BRAND_STYLES[id].variation.schemes.map(([ground]) => ground)
    expect(grounds('clinical-luxury').every((g) => g === 'paper' || g === 'tint')).toBe(true)
    // Paper, and ONLY paper. A tinted page was tried twice — `light` at 0.78, then `tint` at 0.92,
    // a value a swatch would call off-white — and both times the model harmonised the blocks and the
    // photograph to it, returning one solid rust tile. Only the ink rotates for this system.
    expect(grounds('graphic-editorial').every((g) => g === 'paper')).toBe(true)
    // The poster system is the one that swings the full ladder, dark grounds included.
    expect(grounds('hyperreal-poster')).toContain('ink')
  })

  it('gives every style at least a few schemes to rotate through', () => {
    for (const id of BRAND_STYLE_IDS) {
      expect(BRAND_STYLES[id].variation.schemes.length, id).toBeGreaterThanOrEqual(4)
    }
  })

  // The same pair is a flat backdrop to a poster and printed ink to an editorial.
  it('describes the same pair differently per style', () => {
    const said = BRAND_STYLE_IDS.map((id) =>
      BRAND_STYLES[id].variation.colorDirective('pale violet', 'near-black violet')
    )
    expect(new Set(said).size).toBe(BRAND_STYLE_IDS.length)
    for (const sentence of said) {
      expect(sentence).toContain('pale violet')
      expect(sentence).toContain('near-black violet')
    }
  })

  it('directs each style in its own words', () => {
    const luxury = artDirectionFor(key(), getBrandStyle('clinical-luxury'))
    const poster = artDirectionFor(key(), POSTER)
    expect(luxury).not.toBe(poster)
    expect(
      BRAND_STYLES['clinical-luxury'].variation.framings.some((f) => luxury!.includes(f))
    ).toBe(true)
  })
})

/**
 * The editor's "New picture" strip generates several options for the user to choose between, so
 * consecutive presses must arrive with different briefs. The nonce it sends is the slide's
 * background path plus a press counter (`backgroundNonce`, use-editor-ai-ops.ts) — the counter
 * because the background does not change until a candidate is picked, which is what made every
 * option in the strip a variation of one framing.
 *
 * Asserted rather than reasoned about: `hashIndex` is a polynomial hash truncated to 32 bits, and
 * the nonce is not the last field in the string it hashes, so whether "…:0", "…:1", "…:2" separate
 * is a question about overflow rather than about arithmetic.
 */
describe('editor press nonces', () => {
  const PATH = 'client-7/post-3/1755900000000-background.jpg'
  const presses = (count: number) =>
    Array.from({ length: count }, (_, press) => key({ nonce: `${PATH}:${press}` }))

  it('gives the first three presses of a slide three different briefs', () => {
    const briefs = presses(3).map((k) => artDirectionFor(k, POSTER))
    expect(new Set(briefs).size).toBe(3)
  })

  it('keeps separating presses well past the point a person keeps pressing', () => {
    const briefs = presses(8).map((k) => artDirectionFor(k, POSTER))
    // Six framings x six treatments: eight presses cannot all be distinct by luck, but a nonce
    // that moved the hash in lockstep with the bucket count would repeat immediately.
    expect(new Set(briefs).size).toBeGreaterThanOrEqual(6)
  })

  it('separates presses for every style, not just the one this was checked against', () => {
    for (const id of BRAND_STYLE_IDS) {
      const briefs = presses(3).map((k) => artDirectionFor(k, BRAND_STYLES[id]))
      expect(new Set(briefs).size, `${id} repeats a brief within three presses`).toBe(3)
    }
  })

  it('still separates presses on a slide whose picture was swapped in between', () => {
    // Picking a candidate changes the background path, so the counter carries on from a new prefix.
    const before = artDirectionFor(key({ nonce: `${PATH}:1` }), POSTER)
    const after = artDirectionFor(
      key({ nonce: `client-7/post-3/1755900999999-background.jpg:2` }),
      POSTER
    )
    expect(after).not.toBe(before)
  })
})

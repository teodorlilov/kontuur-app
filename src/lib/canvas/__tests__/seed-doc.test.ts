import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { BRAND_STYLES } from '@/lib/visual/brand-styles'
import { parseCanvasDoc } from '../doc-schema'
import { applyCopyToDoc, captionHook, createTextNode, seedCanvasDoc } from '../seed-doc'
import { getFontEntry } from '../font-library'
import type { VariationKey } from '@/lib/visual/variation'

const background = { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' }

// Seeding only ever produces text; this narrows the union so assertions can read its fields.
function seededText(doc: CanvasDoc): CanvasTextNode[] {
  return doc.nodes.map((node) => {
    if (node.kind !== 'text') throw new Error('seeding produced a non-text node')
    return node
  })
}

describe('seedCanvasDoc', () => {
  it('seeds headline + body for a carousel slide in the style pairing (default = graphic-editorial)', () => {
    const doc = seedCanvasDoc({
      identity: buildDefaultIdentity(),
      background,
      slide: {
        headline: 'Защо кожата ви има нужда от SPF',
        body: 'Слънцето уврежда кожата целогодишно.',
      },
    })
    expect(parseCanvasDoc(doc)).toEqual(doc)
    expect(doc.nodes).toHaveLength(2)
    const [headline, body] = seededText(doc)
    expect(headline!.role).toBe('headline')
    // Against the REGISTRY, not a literal: this asserts the seeder wires the style's pairing
    // through, which is the actual contract. Naming the face pinned the test to a taste decision
    // and broke it the day the default changed.
    expect(headline!.fontFamily).toBe(BRAND_STYLES['graphic-editorial'].fonts.display)
    // graphic-editorial's signature is heavy caps — a render flag, the stored text stays raw
    expect(headline!.text).toBe('Защо кожата ви има нужда от SPF')
    expect(headline!.uppercase).toBe(true)
    expect(body!.fontFamily).toBe(BRAND_STYLES['graphic-editorial'].fonts.body)
    expect(body!.text).toBe('Слънцето уврежда кожата целогодишно.')
    // Off, and solid when it is switched on: a seeded slide shows the picture it was generated with.
    expect(doc.backdrop).toEqual({ enabled: false, color: '#FFFFFF', opacity: 1 })
    expect(doc.background).toEqual(background)
    expect(doc.flattenedStoragePath).toBeNull()
  })

  it('does not upper-case headlines for clinical-luxury and uses its pairing', () => {
    const doc = seedCanvasDoc({
      identity: { ...buildDefaultIdentity(), style: 'clinical-luxury' },
      background,
      slide: { headline: 'Ритуалът на спокойствието', body: '' },
    })
    expect(doc.nodes).toHaveLength(1)
    expect(seededText(doc)[0]!.text).toBe('Ритуалът на спокойствието')
    expect(seededText(doc)[0]!.uppercase).toBeUndefined()
    expect(seededText(doc)[0]!.fontFamily).toBe(BRAND_STYLES['clinical-luxury'].fonts.display)
  })

  it('omits layers for empty copy', () => {
    const doc = seedCanvasDoc({
      identity: buildDefaultIdentity(),
      background,
      slide: { headline: '', body: '' },
    })
    expect(doc.nodes).toHaveLength(0)
  })

  it('seeds a single post with the caption hook only', () => {
    const doc = seedCanvasDoc({
      identity: buildDefaultIdentity(),
      background,
      caption: 'Лятото идва! Запазете час днес на www.example.com #лято @studio',
    })
    expect(doc.nodes).toHaveLength(1)
    expect(seededText(doc)[0]!.role).toBe('headline')
    expect(seededText(doc)[0]!.text).toBe('Лятото идва!')
    expect(seededText(doc)[0]!.uppercase).toBe(true)
  })
})

describe('seedCanvasDoc with a variation key', () => {
  // A dressed slide legitimately holds non-text members — a lockup can add a rule or a block — so
  // these assertions filter rather than using the strict `seededText` the flat path is checked with.
  const textOnly = (doc: CanvasDoc): CanvasTextNode[] =>
    doc.nodes.filter((node): node is CanvasTextNode => node.kind === 'text')

  const identity = buildDefaultIdentity()
  const latin = { headline: 'Ten tips for founders', body: 'What nobody tells you.' }
  const key = (over: Partial<VariationKey> = {}): VariationKey => ({
    subject: 'post-1',
    position: 0,
    total: 4,
    nonce: '',
    ...over,
  })

  const seed = (variation: VariationKey, slide = latin) =>
    seedCanvasDoc({ identity, background, slide, variation })

  it('lays the copy out in a designed lockup instead of the flat geometry', () => {
    const flat = seedCanvasDoc({ identity, background, slide: latin })
    const dressed = seed(key())
    expect(parseCanvasDoc(dressed)).toEqual(dressed)
    expect(
      textOnly(dressed)
        .map((n) => n.text)
        .join(' ')
    ).toContain('founders')
    // Something about the type must have moved, or the catalogue is not being used at all.
    const geometry = (doc: CanvasDoc) => textOnly(doc).map((n) => `${n.x},${n.y},${n.fontSize}`)
    expect(geometry(dressed)).not.toEqual(geometry(flat))
  })

  it('is deterministic for a slide and attempt', () => {
    expect(textOnly(seed(key())).map((n) => n.y)).toEqual(textOnly(seed(key())).map((n) => n.y))
  })

  it('gives different slides of one post different layouts', () => {
    const layouts = new Set(
      [0, 1, 2, 3].map((position) =>
        JSON.stringify(textOnly(seed(key({ position }))).map((n) => [n.x, n.y, n.fontSize]))
      )
    )
    expect(layouts.size).toBeGreaterThan(1)
  })

  /**
   * Konva writes `fontFamily` into `ctx.font` with no fallback list, so a Latin-only face meeting
   * Cyrillic produces per-glyph OS substitution that bakes into the exported JPEG differently on
   * every machine. `lockupBlock` is the gate; this proves seeding actually consults it.
   */
  it('never puts Cyrillic copy in a Latin-only lockup', () => {
    const cyrillic = { headline: 'Десет съвета за основатели', body: 'Какво никой не ви казва.' }
    for (const position of [0, 1, 2, 3]) {
      for (const node of textOnly(seed(key({ position }), cyrillic))) {
        expect(getFontEntry(node.fontFamily)?.cyrillic, `${node.fontFamily} @${position}`).toBe(
          true
        )
      }
    }
  })

  // The flat geometry has no capacity limit, which is what makes it the correct fallback.
  it('still produces readable copy when no lockup can hold it', () => {
    const huge = { headline: 'word '.repeat(60).trim(), body: 'more '.repeat(80).trim() }
    const doc = seed(key(), huge)
    expect(textOnly(doc).length).toBeGreaterThan(0)
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('seeds nothing for empty copy rather than dressing an empty slide', () => {
    expect(seed(key(), { headline: '', body: '' }).nodes).toHaveLength(0)
  })
})

describe('captionHook', () => {
  it('takes the first sentence and strips URLs, hashtags and mentions', () => {
    expect(
      captionHook('Big news from @studio! Visit https://x.test #promo. More text after.')
    ).toBe('Big news from !')
  })

  it('clamps an unpunctuated caption at a word boundary', () => {
    const hook = captionHook('дълга непрекъсната поредица от думи '.repeat(10))
    expect(hook.length).toBeLessThanOrEqual(91)
    expect(hook.endsWith('…')).toBe(true)
    expect(hook).not.toContain('  ')
  })

  it('returns empty for an empty caption', () => {
    expect(captionHook(null)).toBe('')
    expect(captionHook('   ')).toBe('')
  })
})

describe('applyCopyToDoc', () => {
  const identity = buildDefaultIdentity()

  function seededDoc() {
    return seedCanvasDoc({
      identity,
      background,
      slide: { headline: 'Old headline', body: 'Old body.' },
    })
  }

  it('refreshes role text from new copy (the uppercase flag persists on the node)', () => {
    const updated = seededText(
      applyCopyToDoc(seededDoc(), { slide: { headline: 'New headline', body: 'New body.' } })
    )
    expect(updated[0]!.text).toBe('New headline')
    expect(updated[0]!.uppercase).toBe(true) // seeded flag survives the refresh
    expect(updated[1]!.text).toBe('New body.')
  })

  it('keeps hand-edited wording untouched', () => {
    const doc = seededDoc()
    doc.nodes[0] = { ...seededText(doc)[0]!, text: 'My custom wording', textOverridden: true }
    const updated = seededText(
      applyCopyToDoc(doc, { slide: { headline: 'New headline', body: 'New body.' } })
    )
    expect(updated[0]!.text).toBe('My custom wording')
    expect(updated[1]!.text).toBe('New body.')
  })

  it('leaves text alone when the new copy is empty', () => {
    const doc = seededDoc()
    const updated = applyCopyToDoc(doc, { slide: { headline: '', body: '' } })
    expect(seededText(updated).map((node) => node.text)).toEqual(
      seededText(doc).map((node) => node.text)
    )
  })
})

describe('createTextNode', () => {
  it('creates a custom layer in the style body font with a unique id', () => {
    const identity = buildDefaultIdentity()
    const a = createTextNode('custom', identity)
    const b = createTextNode('custom', identity)
    expect(a.role).toBe('custom')
    expect(a.fontFamily).toBe(BRAND_STYLES['graphic-editorial'].fonts.body)
    expect(a.id).not.toBe(b.id)
  })
})

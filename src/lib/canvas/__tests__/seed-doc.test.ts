import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { parseCanvasDoc } from '../doc-schema'
import { applyCopyToDoc, captionHook, createTextNode, seedCanvasDoc } from '../seed-doc'

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
    expect(headline!.fontFamily).toBe('Oswald')
    // graphic-editorial's signature is condensed caps — a render flag, the stored text stays raw
    expect(headline!.text).toBe('Защо кожата ви има нужда от SPF')
    expect(headline!.uppercase).toBe(true)
    expect(body!.fontFamily).toBe('Source Sans 3')
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
    expect(seededText(doc)[0]!.fontFamily).toBe('Playfair Display')
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
    expect(a.fontFamily).toBe('Source Sans 3')
    expect(a.id).not.toBe(b.id)
  })
})

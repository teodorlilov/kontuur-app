import { describe, expect, it } from 'vitest'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { parseCanvasDoc } from '../doc-schema'
import { applyCopyToDoc, captionHook, createTextLayer, seedCanvasDoc } from '../seed-doc'

const background = { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' }

describe('seedCanvasDoc', () => {
  it('seeds headline + body for a carousel slide in the style pairing (default = graphic-editorial)', () => {
    const doc = seedCanvasDoc({
      identity: buildDefaultIdentity(),
      background,
      slide: { headline: 'Защо кожата ви има нужда от SPF', body: 'Слънцето уврежда кожата целогодишно.' },
    })
    expect(parseCanvasDoc(doc)).toEqual(doc)
    expect(doc.layers).toHaveLength(2)
    const [headline, body] = doc.layers
    expect(headline!.role).toBe('headline')
    expect(headline!.fontFamily).toBe('Oswald')
    // graphic-editorial's signature is condensed caps
    expect(headline!.text).toBe('ЗАЩО КОЖАТА ВИ ИМА НУЖДА ОТ SPF')
    expect(body!.fontFamily).toBe('Source Sans 3')
    expect(body!.text).toBe('Слънцето уврежда кожата целогодишно.')
    expect(doc.scrim).toEqual({ enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' })
    expect(doc.background).toEqual(background)
    expect(doc.flattenedStoragePath).toBeNull()
  })

  it('does not upper-case headlines for clinical-luxury and uses its pairing', () => {
    const doc = seedCanvasDoc({
      identity: { ...buildDefaultIdentity(), style: 'clinical-luxury' },
      background,
      slide: { headline: 'Ритуалът на спокойствието', body: '' },
    })
    expect(doc.layers).toHaveLength(1)
    expect(doc.layers[0]!.text).toBe('Ритуалът на спокойствието')
    expect(doc.layers[0]!.fontFamily).toBe('Playfair Display')
  })

  it('omits layers for empty copy', () => {
    const doc = seedCanvasDoc({ identity: buildDefaultIdentity(), background, slide: { headline: '', body: '' } })
    expect(doc.layers).toHaveLength(0)
  })

  it('seeds a single post with the caption hook only', () => {
    const doc = seedCanvasDoc({
      identity: buildDefaultIdentity(),
      background,
      caption: 'Лятото идва! Запазете час днес на www.example.com #лято @studio',
    })
    expect(doc.layers).toHaveLength(1)
    expect(doc.layers[0]!.role).toBe('headline')
    expect(doc.layers[0]!.text).toBe('ЛЯТОТО ИДВА!')
  })
})

describe('captionHook', () => {
  it('takes the first sentence and strips URLs, hashtags and mentions', () => {
    expect(captionHook('Big news from @studio! Visit https://x.test #promo. More text after.')).toBe(
      'Big news from !'
    )
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

  it('refreshes role layers from new copy (headline keeps the style transform)', () => {
    const updated = applyCopyToDoc(seededDoc(), {
      identity,
      slide: { headline: 'New headline', body: 'New body.' },
    })
    expect(updated.layers[0]!.text).toBe('NEW HEADLINE') // graphic-editorial upper-cases
    expect(updated.layers[1]!.text).toBe('New body.')
  })

  it('keeps a hand-edited layer untouched', () => {
    const doc = seededDoc()
    doc.layers[0] = { ...doc.layers[0]!, text: 'My custom wording', textOverridden: true }
    const updated = applyCopyToDoc(doc, { identity, slide: { headline: 'New headline', body: 'New body.' } })
    expect(updated.layers[0]!.text).toBe('My custom wording')
    expect(updated.layers[1]!.text).toBe('New body.')
  })

  it('leaves layers alone when the new copy is empty', () => {
    const doc = seededDoc()
    const updated = applyCopyToDoc(doc, { identity, slide: { headline: '', body: '' } })
    expect(updated.layers.map((l) => l.text)).toEqual(doc.layers.map((l) => l.text))
  })
})

describe('createTextLayer', () => {
  it('creates a custom layer in the style body font with a unique id', () => {
    const identity = buildDefaultIdentity()
    const a = createTextLayer('custom', identity)
    const b = createTextLayer('custom', identity)
    expect(a.role).toBe('custom')
    expect(a.fontFamily).toBe('Source Sans 3')
    expect(a.id).not.toBe(b.id)
  })
})

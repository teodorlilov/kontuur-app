import { describe, expect, it } from 'vitest'
import type { Composition, TextLayer } from '@/lib/scene-graph'
import { localizeComposition, previewLocale } from '../preview-copy'
import { sampleCompositions } from '../compose'

const bySlot = (comp: Composition, slot: string): string | undefined =>
  (comp.layers.find((l) => l.type === 'text' && (l as TextLayer).slot === slot) as TextLayer | undefined)?.content

const cover = () => sampleCompositions('editorial')[0]!
const cta = () => sampleCompositions('editorial')[2]!

describe('previewLocale', () => {
  it('bulgarian or unset → bg, everything else → en', () => {
    for (const bg of ['Bulgarian', 'bg', 'BG', 'bul', '']) expect(previewLocale(bg)).toBe('bg')
    for (const en of ['English', 'en', 'German', 'fr']) expect(previewLocale(en)).toBe('en')
  })
})

describe('localizeComposition', () => {
  it('returns the same object for a Bulgarian client (no-op)', () => {
    const c = cover()
    expect(localizeComposition(c, 'Bulgarian')).toBe(c)
  })

  it('translates the cover headline + kicker to English', () => {
    const out = localizeComposition(cover(), 'English')
    expect(bySlot(out, 'headline')).toBe('Content that\npeople remember')
    expect(bySlot(out, 'kicker')).toBe('On social media')
  })

  it('translates the CTA headline + call-to-action', () => {
    const out = localizeComposition(cta(), 'English')
    expect(bySlot(out, 'headline')).toBe('Ready to\nget started?')
    expect(bySlot(out, 'cta')).toBe('Get in touch →')
  })

  it('marks localized layers as English', () => {
    const out = localizeComposition(cover(), 'en')
    const headline = out.layers.find((l) => l.type === 'text' && (l as TextLayer).slot === 'headline') as TextLayer
    expect(headline.lang).toBe('en')
  })
})

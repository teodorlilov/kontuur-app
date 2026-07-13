import { describe, expect, it } from 'vitest'
import type { Composition, TextLayer } from '@/lib/scene-graph'
import { localizeComposition, previewLocale } from '../preview-copy'
import { feedSystemPack } from '../feed-system-compositions'

const bySlot = (comp: Composition, slot: string): string | undefined =>
  (comp.layers.find((l) => l.type === 'text' && (l as TextLayer).slot === slot) as TextLayer | undefined)?.content

describe('previewLocale', () => {
  it('bulgarian or unset → bg, everything else → en', () => {
    for (const bg of ['Bulgarian', 'bg', 'BG', 'bul', '']) expect(previewLocale(bg)).toBe('bg')
    for (const en of ['English', 'en', 'German', 'fr']) expect(previewLocale(en)).toBe('en')
  })
})

describe('localizeComposition', () => {
  it('returns the same object for a Bulgarian client (no-op)', () => {
    const c = feedSystemPack('editorial').cover
    expect(localizeComposition(c, 'Bulgarian')).toBe(c)
  })

  it('translates mixed-case placeholder copy to English', () => {
    const out = localizeComposition(feedSystemPack('editorial').cover, 'English')
    expect(bySlot(out, 'headline')).toBe('Content that\npeople remember')
    expect(bySlot(out, 'kicker')).toBe('ON SOCIAL MEDIA') // editorial kicker is uppercase → uppercase match
  })

  it('translates the bold-blocks UPPERCASE variant via the uppercase match', () => {
    const out = localizeComposition(feedSystemPack('bold-blocks').cover, 'English')
    expect(bySlot(out, 'headline')).toBe('CONTENT THAT\nPEOPLE REMEMBER')
  })

  it('translates quote headline + attribution', () => {
    const out = localizeComposition(feedSystemPack('editorial').quote, 'English')
    expect(bySlot(out, 'headline')).toBe('Design is a\nsilent ambassador.')
    expect(bySlot(out, 'caption')).toBe('— Paul Rand')
  })

  it('marks localized layers as English', () => {
    const out = localizeComposition(feedSystemPack('editorial').cover, 'en')
    const headline = out.layers.find((l) => l.type === 'text' && (l as TextLayer).slot === 'headline') as TextLayer
    expect(headline.lang).toBe('en')
  })
})

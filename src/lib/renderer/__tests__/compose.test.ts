import { describe, expect, it } from 'vitest'
import type { TextLayer } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { archetypeForSlide, composeSlides, injectCopy } from '../compose'
import { feedSystemPack } from '../feed-system-compositions'
import { getStyle } from '../styles'

const slide = (over: Partial<CarouselSlide> = {}): CarouselSlide => ({ headline: 'H', body: 'B', ...over })
const textBySlot = (layers: readonly { type: string }[], slot: string) =>
  (layers as TextLayer[]).find((l) => l.type === 'text' && l.slot === slot)

describe('archetypeForSlide', () => {
  const style = getStyle('editorial')

  it('opens on an opener and closes on a closer', () => {
    expect(archetypeForSlide(style, slide(), 0, 6, 1).kind).toBe('opener')
    expect(archetypeForSlide(style, slide(), 5, 6, 1).kind).toBe('closer')
  })

  it('draws interior slides from the content pool', () => {
    for (let i = 1; i <= 4; i++) expect(archetypeForSlide(style, slide(), i, 6, 1).kind).toBe('content')
  })

  it('honours an explicit slide_role', () => {
    expect(archetypeForSlide(style, slide({ slide_role: 'cta' }), 2, 6, 1).kind).toBe('closer')
    expect(archetypeForSlide(style, slide({ slide_role: 'cover' }), 3, 6, 1).kind).toBe('opener')
  })

  it('is deterministic for a seed and does not repeat consecutive interior layouts', () => {
    expect(archetypeForSlide(style, slide(), 1, 6, 7).id).toBe(archetypeForSlide(style, slide(), 1, 6, 7).id)
    expect(archetypeForSlide(style, slide(), 1, 6, 7).id).not.toBe(archetypeForSlide(style, slide(), 2, 6, 7).id)
  })
})

describe('injectCopy', () => {
  it('sets headline into the headline slot and body into the secondary slot (list → body)', () => {
    const out = injectCopy(feedSystemPack('editorial').list, slide({ headline: 'Real headline', body: 'Real body' }))
    expect(textBySlot(out.layers, 'headline')!.content).toBe('Real headline')
    expect(textBySlot(out.layers, 'body')!.content).toBe('Real body')
  })
  it('routes body to the caption slot on a quote (no body slot)', () => {
    const out = injectCopy(feedSystemPack('editorial').quote, slide({ headline: 'Quote', body: '— Author' }))
    expect(textBySlot(out.layers, 'headline')!.content).toBe('Quote')
    expect(textBySlot(out.layers, 'caption')!.content).toBe('— Author')
  })
  it('overrides the kicker only when provided', () => {
    const withKicker = injectCopy(feedSystemPack('editorial').cover, slide(), 'ACME')
    expect(textBySlot(withKicker.layers, 'kicker')!.content).toBe('ACME')
    const authored = textBySlot(feedSystemPack('editorial').cover.layers, 'kicker')!.content
    const noKicker = injectCopy(feedSystemPack('editorial').cover, slide())
    expect(textBySlot(noKicker.layers, 'kicker')!.content).toBe(authored)
  })
})

describe('composeSlides', () => {
  const slides = [slide({ headline: 'Cover' }), slide({ headline: 'Mid' }), slide({ headline: 'End' })]

  it('produces one composition per slide with stable ids and the target ratio size', () => {
    const out = composeSlides(slides, { feedSystemSlug: 'bold-blocks', ratio: '1:1', postId: 'p1' })
    expect(out).toHaveLength(3)
    expect(out.map((c) => c.id)).toEqual(['p1-slide-0', 'p1-slide-1', 'p1-slide-2'])
    for (const c of out) expect(c.size).toEqual({ w: 1080, h: 1080 })
    expect(out.every((c) => c.feedSystemId === 'bold-blocks')).toBe(true)
  })

  it('injects each slide headline and defaults unknown feed systems to editorial', () => {
    const out = composeSlides(slides, { feedSystemSlug: 'nope', ratio: '4:5', postId: 'p2' })
    expect(textBySlot(out[0]!.layers, 'headline')!.content).toBe('Cover')
    expect(out[0]!.feedSystemId).toBe('nope') // stored slug is preserved even when the style falls back
  })
})

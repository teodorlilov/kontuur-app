import { describe, expect, it } from 'vitest'
import { validateShareableComposition, type PlateLayer, type ShapeLayer, type TextLayer } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'
import { composeSlides, sampleCompositions, withPlateSrc } from '../compose'

const slide = (over: Partial<CarouselSlide> = {}): CarouselSlide => ({ headline: 'H', body: 'B', ...over })
const bySlot = (c: { layers: unknown[] }, slot: string) => (c.layers as TextLayer[]).find((l) => l.type === 'text' && l.slot === slot)
const plateOf = (c: { layers: unknown[] }) => (c.layers as PlateLayer[]).find((l) => l.type === 'plate')
const one = (slug: string) => composeSlides([slide()], { feedSystemSlug: slug, ratio: '4:5', postId: 'p' })[0]!

describe('composeSlides', () => {
  const slides = [slide({ headline: 'Cover' }), slide({ headline: 'Mid' }), slide({ headline: 'End' })]

  it('produces one composition per slide with stable ids, the target ratio size, and the style id', () => {
    const out = composeSlides(slides, { feedSystemSlug: 'bold-blocks', ratio: '1:1', postId: 'p1', kicker: 'ACME' })
    expect(out).toHaveLength(3)
    expect(out.map((c) => c.id)).toEqual(['p1-slide-0', 'p1-slide-1', 'p1-slide-2'])
    for (const c of out) expect(c.size).toEqual({ w: 1080, h: 1080 })
    expect(out.every((c) => c.feedSystemId === 'bold-blocks')).toBe(true)
  })

  it('injects each slide headline into the headline slot', () => {
    const out = composeSlides(slides, { feedSystemSlug: 'editorial', ratio: '4:5', postId: 'p2' })
    expect(bySlot(out[0]!, 'headline')!.content).toBe('Cover')
    expect(bySlot(out[2]!, 'headline')!.content).toBe('End')
  })

  it('a generative style gets a design plate + a legibility scrim; quiet-grid gets a solid colour ground', () => {
    const ed = one('editorial')
    expect(plateOf(ed)?.type).toBe('plate')
    expect(ed.layers.some((l) => l.type === 'shape' && l.id === 'scrim')).toBe(true)

    const qg = one('quiet-grid')
    expect(plateOf(qg)).toBeUndefined()
    expect((qg.layers[0] as ShapeLayer).id).toBe('ground')
    expect(qg.layers.some((l) => l.id === 'scrim')).toBe(false)
  })

  it('text is light over a generative plate and ink on the colour ground', () => {
    expect(bySlot(one('editorial'), 'headline')!.color).toEqual({ mode: 'bound', token: 'color.surface' })
    expect(bySlot(one('quiet-grid'), 'headline')!.color).toEqual({ mode: 'bound', token: 'color.ink' })
  })

  it('shows the client-name kicker on the cover + CTA only, not on interior slides', () => {
    const out = composeSlides([slide({ slide_role: 'cover' }), slide(), slide({ slide_role: 'cta' })], {
      feedSystemSlug: 'editorial',
      ratio: '4:5',
      postId: 'p',
      kicker: 'ACME',
    })
    expect(bySlot(out[0]!, 'kicker')?.content).toBe('ACME')
    expect(bySlot(out[1]!, 'kicker')).toBeUndefined()
    expect(bySlot(out[2]!, 'kicker')?.content).toBe('ACME')
  })

  it('places the text block in the style zone (editorial bottom, bold center)', () => {
    expect(bySlot(one('editorial'), 'headline')!.vAnchor).toBe('bottom')
    expect(bySlot(one('bold-blocks'), 'headline')!.vAnchor).toBe('center')
  })

  it('renders a CTA slide body into the cta slot (not the body slot)', () => {
    const out = composeSlides([slide({ slide_role: 'cta', headline: 'Go', body: 'Contact us →' })], { feedSystemSlug: 'editorial', ratio: '4:5', postId: 'p' })
    expect(bySlot(out[0]!, 'cta')?.content).toBe('Contact us →')
    expect(bySlot(out[0]!, 'body')).toBeUndefined()
  })
})

describe('withPlateSrc', () => {
  it('sets the plate src on a generative slide and no-ops on a colour ground', () => {
    expect(plateOf(withPlateSrc(one('editorial'), 'https://x/y.jpg'))?.src).toBe('https://x/y.jpg')
    const qg = one('quiet-grid')
    expect(withPlateSrc(qg, 'https://x/y.jpg')).toEqual(qg)
  })
})

describe('sampleCompositions', () => {
  it('returns three valid, token-bound sample slides (no hex, no literal family)', () => {
    const s = sampleCompositions('editorial')
    expect(s).toHaveLength(3)
    for (const c of s) expect(validateShareableComposition(c)).toEqual([])
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PlateLayer } from '@/lib/scene-graph'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { composeSlides } from '@/lib/renderer/compose'
import type { CarouselSlide } from '@/types/api'

// Mock the paid provider chain (dynamically imported inside fillImagery) so we test the routing, not fal.
// vi.hoisted so the factories can reference the fns without the mock-hoisting out-of-scope error.
const { resolveDesign, getBrandReferenceImages } = vi.hoisted(() => ({
  resolveDesign: vi.fn(async (_p: { role: string }) => 'https://cdn.example/design.jpg'),
  getBrandReferenceImages: vi.fn(async () => ['https://cdn.example/ref-1.jpg']),
}))
vi.mock('../bank', () => ({ resolveDesign, getBrandReferenceImages }))

const { composeCarouselScenes } = vi.hoisted(() => ({
  composeCarouselScenes: vi.fn(async ({ slides }: { slides: unknown[] }) => slides.map(() => null)),
}))
vi.mock('../scene', () => ({ composeCarouselScenes }))

import { fillImagery } from '../generate-plates'

const slide = (over: Partial<CarouselSlide> = {}): CarouselSlide => ({ headline: 'H', body: 'B', ...over })
const ctx = (feedSystemSlug: string) => ({ clientId: 'c1', brief: null, colors: DEFAULT_TOKENS.color, feedSystemSlug, ratio: '4:5' as const })
const compose = (slides: CarouselSlide[], slug: string) => composeSlides(slides, { feedSystemSlug: slug, ratio: '4:5', postId: 'p', kicker: 'Brand' })
const plateOf = (c: { layers: unknown[] }) => (c.layers as PlateLayer[]).find((l) => l.type === 'plate')

describe('fillImagery routing', () => {
  beforeEach(() => {
    resolveDesign.mockClear()
    getBrandReferenceImages.mockClear()
    composeCarouselScenes.mockClear()
  })

  it('fills every generative slide plate via resolveDesign, fetching references + scenes once', async () => {
    const slides = [slide({ slide_role: 'cover' }), slide()]
    const out = await fillImagery(compose(slides, 'editorial'), slides, ctx('editorial'))
    expect(resolveDesign).toHaveBeenCalledTimes(2)
    expect(getBrandReferenceImages).toHaveBeenCalledTimes(1)
    expect(composeCarouselScenes).toHaveBeenCalledTimes(1)
    expect(plateOf(out[0]!)?.src).toBe('https://cdn.example/design.jpg')
  })

  it('passes cover role for slide 0 and interior after', async () => {
    const slides = [slide({ slide_role: 'cover' }), slide()]
    await fillImagery(compose(slides, 'editorial'), slides, ctx('editorial'))
    expect(resolveDesign.mock.calls.map((c) => c[0].role)).toEqual(['cover', 'interior'])
  })

  it('skips a compositor-only style (quiet-grid) entirely — no spend', async () => {
    const comps = compose([slide()], 'quiet-grid')
    const out = await fillImagery(comps, [slide()], ctx('quiet-grid'))
    expect(resolveDesign).not.toHaveBeenCalled()
    expect(getBrandReferenceImages).not.toHaveBeenCalled()
    expect(out).toEqual(comps)
  })
})

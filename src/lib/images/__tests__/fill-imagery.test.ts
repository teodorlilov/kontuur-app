import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PlateLayer, MarkLayer } from '@/lib/scene-graph'
import { getArchetype } from '@/lib/renderer/archetypes'
import type { CarouselSlide } from '@/types/api'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'

// Mock the paid provider chain (dynamically imported inside fillImagery) so we test the routing, not fal.
// vi.hoisted so the factory can reference the fns without the mock-hoisting out-of-scope error.
const { resolvePlate, resolveVector } = vi.hoisted(() => ({
  resolvePlate: vi.fn(async (_p: { role: string }) => 'https://cdn.example/plate.jpg'),
  resolveVector: vi.fn(async (_p: { motif: string }) => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
}))
vi.mock('../bank', () => ({ resolvePlate, resolveVector }))

import { fillImagery, generatedMarkLayer } from '../generate-plates'

const slide = (over: Partial<CarouselSlide> = {}): CarouselSlide => ({ headline: 'H', body: 'B', ...over })
const ctx = {
  clientId: 'c1',
  brief: { motifs: ['a coffee bean', 'a leaf'] } as never,
  colors: DEFAULT_TOKENS.color,
  feedSystemSlug: 'illustrative',
  ratio: '4:5' as const,
}

const plateOf = (c: { layers: unknown[] }) => (c.layers as PlateLayer[]).find((l) => l.type === 'plate')
const markOf = (c: { layers: unknown[] }) => (c.layers as MarkLayer[]).find((l) => l.type === 'mark')

describe('fillImagery routing', () => {
  beforeEach(() => {
    resolvePlate.mockClear()
    resolveVector.mockClear()
  })

  it('fills a plate archetype via resolvePlate and a generated-mark archetype via resolveVector', async () => {
    const photo = getArchetype('editorial-cover')!.composition // has a plate
    const vector = getArchetype('vector-hero')!.composition // has a generated mark
    const [outPhoto, outVector] = await fillImagery([photo, vector], [slide(), slide()], ctx)

    expect(resolvePlate).toHaveBeenCalledTimes(1)
    expect(resolveVector).toHaveBeenCalledTimes(1)
    expect(plateOf(outPhoto!)?.src).toBe('https://cdn.example/plate.jpg')
    expect(markOf(outVector!)?.svg).toContain('<svg')
  })

  it('leaves a no-imagery archetype untouched (no spend)', async () => {
    const none = getArchetype('tile-grid')!.composition
    const [out] = await fillImagery([none], [slide()], ctx)
    expect(resolvePlate).not.toHaveBeenCalled()
    expect(resolveVector).not.toHaveBeenCalled()
    expect(out).toEqual(none)
  })

  it('cycles the brief motifs across generated-vector slides', async () => {
    const vector = getArchetype('vector-hero')!.composition
    await fillImagery([vector, vector], [slide(), slide()], ctx)
    const motifs = resolveVector.mock.calls.map((c) => c[0].motif)
    expect(motifs).toEqual(['a coffee bean', 'a leaf']) // index 0, 1 → motifs[0], motifs[1]
  })
})

describe('generatedMarkLayer', () => {
  it('finds only source=generated marks', () => {
    expect(generatedMarkLayer(getArchetype('vector-hero')!.composition)?.source).toBe('generated')
    expect(generatedMarkLayer(getArchetype('editorial-quote')!.composition)).toBeUndefined() // static quote mark
    expect(generatedMarkLayer(getArchetype('tile-grid')!.composition)).toBeUndefined()
  })
})

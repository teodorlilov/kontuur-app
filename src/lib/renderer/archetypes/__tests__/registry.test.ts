import { describe, expect, it } from 'vitest'
import { validateShareableComposition } from '@/lib/scene-graph'
import { ARCHETYPES } from '../index'

const entries = Object.entries(ARCHETYPES)

describe('archetype registry', () => {
  // Token-binding resolution + rendering is exercised against the Konva renderer at runtime (canvas is
  // unavailable in jsdom); here we assert every archetype is a valid, shareable, token-only scene graph.
  it.each(entries)('%s is a valid shareable composition (no hex, no literal family)', (_id, a) => {
    expect(validateShareableComposition(a.composition)).toEqual([])
  })

  it('each archetype id matches its map key and its composition id', () => {
    for (const [id, a] of entries) {
      expect(a.id).toBe(id)
      expect(a.composition.id).toBe(id)
    }
  })

  it('has openers, closers, and content archetypes', () => {
    const kinds = new Set(entries.map(([, a]) => a.kind))
    expect(kinds.has('opener')).toBe(true)
    expect(kinds.has('closer')).toBe(true)
    expect(kinds.has('content')).toBe(true)
  })

  it('every layer id within a composition is unique', () => {
    for (const [id, a] of entries) {
      const ids = a.composition.layers.map((l) => l.id)
      expect(new Set(ids).size, `${id} has duplicate layer ids`).toBe(ids.length)
    }
  })

  it('ships the new no-photo graphic archetypes', () => {
    for (const id of ['split', 'stat', 'annotated-type', 'tile-grid']) {
      expect(ARCHETYPES[id]?.imagery).toBe('none')
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { Composition, Rect } from '@/lib/scene-graph'
import { applyVAnchors, RATIO_SIZES, resolveComposition, resolveRect } from '../anchor'

const rect = (y: number, h: number): Rect => ({ x: 96, y, w: 888, h, rotate: 0 })

describe('resolveRect (1350 → 810, Δ = -540)', () => {
  it('top (default) is unchanged', () => {
    expect(resolveRect(rect(128, 60), 'top', 1350, 810)).toEqual(rect(128, 60))
    expect(resolveRect(rect(128, 60), undefined, 1350, 810)).toEqual(rect(128, 60))
  })
  it('bottom shifts by Δheight (keeps distance from the bottom)', () => {
    expect(resolveRect(rect(1244, 20), 'bottom', 1350, 810).y).toBe(1244 - 540)
  })
  it('center shifts by Δheight/2', () => {
    expect(resolveRect(rect(470, 410), 'center', 1350, 810).y).toBe(470 - 270)
  })
  it('fill stretches to the whole canvas', () => {
    expect(resolveRect(rect(0, 1350), 'fill', 1350, 810)).toEqual({ x: 96, y: 0, w: 888, h: 810, rotate: 0 })
  })
  it('stretch keeps both insets (y fixed, height grows by Δ)', () => {
    // frame inset 64 top/bottom at 1350 → still inset 64 at 810
    const out = resolveRect({ x: 64, y: 64, w: 952, h: 1222, rotate: 0 }, 'stretch', 1350, 810)
    expect(out.y).toBe(64)
    expect(out.h).toBe(1222 - 540)
    expect(810 - out.y - out.h).toBe(64) // bottom inset preserved
  })
  it('returns the rect unchanged when heights match', () => {
    const r = rect(720, 470)
    expect(resolveRect(r, 'center', 1350, 1350)).toBe(r)
  })
})

const comp: Composition = {
  id: 'c',
  feedSystemId: 'x',
  brandKitVersion: 1,
  size: { w: 1080, h: 1350 },
  layers: [
    { id: 'bg', name: 'bg', locked: false, hidden: false, rect: { x: 0, y: 0, w: 1080, h: 1350, rotate: 0 }, vAnchor: 'fill', opacity: { mode: 'literal', value: 1 }, blendMode: { mode: 'literal', value: 'normal' }, clip: { kind: 'none' }, type: 'shape', shape: 'rect', fill: { mode: 'bound', token: 'color.surface' } },
    { id: 'dots', name: 'dots', locked: false, hidden: false, rect: { x: 96, y: 1244, w: 240, h: 20, rotate: 0 }, vAnchor: 'bottom', opacity: { mode: 'literal', value: 1 }, blendMode: { mode: 'literal', value: 'normal' }, clip: { kind: 'none' }, type: 'chrome', component: 'index-dots', params: {} },
  ],
}

describe('resolveComposition', () => {
  it('returns the same object when the size matches (no-op for the authored 4:5)', () => {
    expect(resolveComposition(comp, { w: 1080, h: 1350 })).toBe(comp)
  })
  it('repositions layers per vAnchor at 1:1 and keeps width', () => {
    const out = resolveComposition(comp, RATIO_SIZES['1:1'])
    expect(out.size).toEqual({ w: 1080, h: 1080 })
    expect(out.layers[0]!.rect).toEqual({ x: 0, y: 0, w: 1080, h: 1080, rotate: 0 }) // bg fill
    expect(out.layers[1]!.rect.y).toBe(1244 - 270) // dots bottom, Δ = -270
    expect(out.layers[1]!.rect.x).toBe(96) // horizontal untouched
  })
})

describe('applyVAnchors', () => {
  it('stamps anchors by layer id and leaves others as top', () => {
    const bare = { ...comp, layers: comp.layers.map((l) => ({ ...l, vAnchor: undefined })) }
    const out = applyVAnchors(bare, { bg: 'fill' })
    expect(out.layers[0]!.vAnchor).toBe('fill')
    expect(out.layers[1]!.vAnchor).toBeUndefined()
  })
})

describe('RATIO_SIZES', () => {
  it('are all 1080 wide (4:5 + 1:1; 4:3 dropped)', () => {
    for (const s of Object.values(RATIO_SIZES)) expect(s.w).toBe(1080)
    expect(RATIO_SIZES['4:5'].h).toBe(1350)
    expect(RATIO_SIZES['1:1'].h).toBe(1080)
    expect(Object.keys(RATIO_SIZES)).toEqual(['4:5', '1:1'])
  })
})

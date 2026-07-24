import { describe, expect, it } from 'vitest'
import type { CanvasDoc } from '@/types/canvas'
import { parseCanvasDoc, safeParseCanvasDoc } from '../doc-schema'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'

function validDoc(): CanvasDoc {
  return {
    version: 1,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' },
    layers: [
      {
        id: 'l1',
        role: 'headline',
        text: 'Ново лятно предложение',
        x: 96,
        y: 128,
        width: 888,
        fontFamily: 'Oswald',
        fontSize: 88,
        fontWeight: 700,
        fill: '#1A1A1A',
        align: 'left',
        lineHeight: 1.1,
      },
    ],
  }
}

describe('canvasDocSchema', () => {
  it('round-trips a valid doc', () => {
    const doc = validDoc()
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('accepts optional textOverridden and a set flattenedStoragePath', () => {
    const doc = validDoc()
    doc.layers[0]!.textOverridden = true
    doc.flattenedStoragePath = 'c1/p1/flat.jpg'
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('accepts optional rotation and backgroundTransform (and docs without them keep parsing)', () => {
    const doc = validDoc()
    expect(parseCanvasDoc(doc)).toEqual(doc) // pre-reposition doc: neither field present
    doc.layers[0]!.rotation = -12
    doc.backgroundTransform = { zoom: 1.6, offsetX: 0.2, offsetY: 1 }
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('rejects out-of-range rotation and background transforms', () => {
    const rotated = validDoc()
    rotated.layers[0]!.rotation = 200
    expect(safeParseCanvasDoc(rotated).success).toBe(false)

    const zoomed = validDoc()
    zoomed.backgroundTransform = { zoom: 4, offsetX: 0.5, offsetY: 0.5 }
    expect(safeParseCanvasDoc(zoomed).success).toBe(false)

    const panned = validDoc()
    panned.backgroundTransform = { zoom: 2, offsetX: 1.2, offsetY: 0.5 }
    expect(safeParseCanvasDoc(panned).success).toBe(false)
  })

  it('rejects a non-hex fill', () => {
    const doc = validDoc()
    doc.layers[0]!.fill = 'red'
    const result = safeParseCanvasDoc(doc)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.join()).toContain('fill')
  })

  it('rejects an unknown version', () => {
    expect(safeParseCanvasDoc({ ...validDoc(), version: 2 }).success).toBe(false)
  })

  it('rejects a missing background', () => {
    const doc: Record<string, unknown> = { ...validDoc() }
    delete doc.background
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects more than 20 layers', () => {
    const doc = validDoc()
    const layer = doc.layers[0]!
    doc.layers = Array.from({ length: 21 }, (_, i) => ({ ...layer, id: `l${i}` }))
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects an unsupported font weight', () => {
    const doc = validDoc()
    doc.layers[0]!.fontWeight = 300 as never
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { canvasDocSchemaV1, upgradeCanvasDoc, type CanvasDocV1 } from '../doc-v1'
import { parseCanvasDoc, safeParseCanvasDoc } from '../doc-schema'

/**
 * A v1 doc in the shape rows actually hold: a headline and a body in `layers`, a logo below the
 * text and a cut-out subject promoted in front of it. This is the fixture the whole cutover rests
 * on — if the upgrade reorders it, every saved layout silently changes on next open.
 */
function v1Doc(): CanvasDocV1 {
  return {
    version: 1,
    canvas: { w: 1080, h: 1350 },
    background: { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' },
    backgroundTransform: { zoom: 1.4, offsetX: 0.3, offsetY: 0.6 },
    flattenedStoragePath: 'c1/p1/flat.jpg',
    scrim: { enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' },
    elements: [
      {
        id: 'logo',
        kind: 'svg',
        src: { publicUrl: 'https://x.test/logo.svg', storagePath: 'c1/p1/logo.svg' },
        x: 60,
        y: 1180,
        width: 180,
        height: 60,
        opacity: 0.9,
      },
      {
        id: 'subject',
        kind: 'image',
        src: { publicUrl: 'https://x.test/cut.png', storagePath: 'c1/p1/cut.png' },
        x: 400,
        y: 200,
        width: 500,
        height: 700,
        rotation: -4,
        aboveText: true,
      },
    ],
    layers: [
      {
        id: 'head',
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
        uppercase: true,
      },
      {
        id: 'body',
        role: 'body',
        text: 'Само до края на месеца.',
        x: 96,
        y: 760,
        width: 888,
        fontFamily: 'Source Sans 3',
        fontSize: 44,
        fontWeight: 400,
        fill: '#1A1A1A',
        align: 'left',
        lineHeight: 1.35,
        textOverridden: true,
      },
    ],
  }
}

describe('upgradeCanvasDoc', () => {
  it('preserves v1 render order exactly: below-text assets, then text, then above-text assets', () => {
    const upgraded = upgradeCanvasDoc(v1Doc())
    expect(upgraded.nodes.map((node) => node.id)).toEqual(['logo', 'head', 'body', 'subject'])
    expect(upgraded.version).toBe(2)
  })

  it('carries every field across, and drops only aboveText (now expressed as position)', () => {
    const upgraded = upgradeCanvasDoc(v1Doc())
    expect(upgraded.nodes[0]).toEqual({
      id: 'logo',
      kind: 'svg',
      src: { publicUrl: 'https://x.test/logo.svg', storagePath: 'c1/p1/logo.svg' },
      x: 60,
      y: 1180,
      width: 180,
      height: 60,
      opacity: 0.9,
    })
    expect(upgraded.nodes[3]).not.toHaveProperty('aboveText')
    expect(upgraded.nodes[3]).toMatchObject({ id: 'subject', rotation: -4 })
    expect(upgraded.nodes[1]).toMatchObject({ kind: 'text', role: 'headline', uppercase: true })
    expect(upgraded.nodes[2]).toMatchObject({ kind: 'text', textOverridden: true })
  })

  it('keeps the doc-level fields, including the background crop', () => {
    const upgraded = upgradeCanvasDoc(v1Doc())
    expect(upgraded.background).toEqual(v1Doc().background)
    expect(upgraded.backgroundTransform).toEqual({ zoom: 1.4, offsetX: 0.3, offsetY: 0.6 })
    expect(upgraded.flattenedStoragePath).toBe('c1/p1/flat.jpg')
    expect(upgraded.scrim).toEqual(v1Doc().scrim)
  })

  it('leaves no v1 keys behind', () => {
    // Through unknown: the point of this test is to inspect keys the type says cannot be there.
    const upgraded = upgradeCanvasDoc(v1Doc()) as unknown as Record<string, unknown>
    expect(upgraded).not.toHaveProperty('layers')
    expect(upgraded).not.toHaveProperty('elements')
  })

  it('handles a doc with no elements at all (the common single-image slide)', () => {
    const doc = v1Doc()
    delete doc.elements
    expect(upgradeCanvasDoc(doc).nodes.map((node) => node.id)).toEqual(['head', 'body'])
  })

  it('produces a doc the v2 write gate accepts, so the next save persists v2', () => {
    const upgraded = upgradeCanvasDoc(v1Doc())
    expect(parseCanvasDoc(upgraded)).toEqual(upgraded)
  })
})

describe('safeParseCanvasDoc version dispatch', () => {
  it('upgrades a stored v1 row transparently', () => {
    const result = safeParseCanvasDoc(v1Doc())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.doc.version).toBe(2)
      expect(result.doc.nodes.map((node) => node.id)).toEqual(['logo', 'head', 'body', 'subject'])
    }
  })

  it('reports a broken v1 row against v1 rules rather than v2 ones', () => {
    const broken = v1Doc()
    broken.layers[0]!.fill = 'not-a-hex'
    const result = safeParseCanvasDoc(broken)
    expect(result.success).toBe(false)
    // "layers.0.fill" proves it was judged as v1; a v2 parse would only complain about `nodes`.
    if (!result.success) expect(result.issues.join()).toContain('layers')
  })

  it('still rejects a v1 doc that was never valid', () => {
    const broken: Record<string, unknown> = { ...v1Doc() }
    delete broken.background
    expect(safeParseCanvasDoc(broken).success).toBe(false)
  })

  it('accepts the v1 schema itself, so the legacy island keeps its own guard', () => {
    expect(canvasDocSchemaV1.safeParse(v1Doc()).success).toBe(true)
  })
})

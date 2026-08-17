import { describe, expect, it } from 'vitest'
import type { CanvasDoc, CanvasImageNode, CanvasTextNode } from '@/types/canvas'
import { parseCanvasDoc, safeParseCanvasDoc } from '../doc-schema'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'

function textNode(overrides: Partial<CanvasTextNode> = {}): CanvasTextNode {
  return {
    id: 'l1',
    kind: 'text',
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
    ...overrides,
  }
}

function imageNode(overrides: Partial<CanvasImageNode> = {}): CanvasImageNode {
  return {
    id: 'e1',
    kind: 'svg',
    src: { publicUrl: 'https://x.test/a.svg', storagePath: 'c1/p1/a.svg' },
    x: 100,
    y: 200,
    width: 420,
    height: 300,
    ...overrides,
  }
}

function validDoc(): CanvasDoc {
  return {
    version: 2,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://x.test/clean.jpg', storagePath: 'c1/p1/clean.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' },
    nodes: [textNode()],
  }
}

// The node at index 0 of a fresh validDoc(), narrowed — the schema types `nodes` as the union.
function firstText(doc: CanvasDoc): CanvasTextNode {
  const node = doc.nodes[0]
  if (!node || node.kind !== 'text') throw new Error('fixture drifted: node 0 is not text')
  return node
}

describe('canvasDocSchema', () => {
  it('round-trips a valid doc', () => {
    const doc = validDoc()
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('accepts optional textOverridden and a set flattenedStoragePath', () => {
    const doc = validDoc()
    firstText(doc).textOverridden = true
    doc.flattenedStoragePath = 'c1/p1/flat.jpg'
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('accepts optional rotation and backgroundTransform (and docs without them keep parsing)', () => {
    const doc = validDoc()
    expect(parseCanvasDoc(doc)).toEqual(doc) // pre-reposition doc: neither field present
    firstText(doc).rotation = -12
    doc.backgroundTransform = { zoom: 1.6, offsetX: 0.2, offsetY: 1 }
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('accepts optional italic + highlight and rejects a non-hex highlight', () => {
    const doc = validDoc()
    firstText(doc).italic = true
    firstText(doc).highlight = '#D6FF4B'
    expect(parseCanvasDoc(doc)).toEqual(doc)
    firstText(doc).highlight = 'lime'
    expect(() => parseCanvasDoc(doc)).toThrow()
  })

  it('accepts image nodes anywhere in the list and rejects out-of-range values', () => {
    const doc = validDoc()
    // Between two text nodes — the ordering v1 could not express at all.
    doc.nodes = [textNode({ id: 'l1' }), imageNode({ rotation: -12, opacity: 0.8 }), textNode({ id: 'l2' })]
    expect(parseCanvasDoc(doc)).toEqual(doc)

    const badOpacity = validDoc()
    badOpacity.nodes = [imageNode({ opacity: 1.5 })]
    expect(safeParseCanvasDoc(badOpacity).success).toBe(false)

    const badSize = validDoc()
    badSize.nodes = [imageNode({ width: 0 })]
    expect(safeParseCanvasDoc(badSize).success).toBe(false)
  })

  it('rejects a node whose kind is not a known one', () => {
    const doc = validDoc()
    doc.nodes = [{ ...imageNode(), kind: 'polygon' } as never]
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('accepts the three shape kinds, interleaved with everything else', () => {
    const doc = validDoc()
    doc.nodes = [
      { id: 'r', kind: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#112233', cornerRadius: 4 },
      textNode(),
      { id: 'e', kind: 'ellipse', x: 0, y: 0, width: 10, height: 10, stroke: '#112233', strokeWidth: 2 },
      { id: 'l', kind: 'line', x: 0, y: 0, width: 10, height: 6, stroke: '#112233', strokeWidth: 6 },
    ]
    expect(parseCanvasDoc(doc)).toEqual(doc)
  })

  it('rejects a zero-width stroke — a line IS its stroke, so zero would be an invisible node', () => {
    const doc = validDoc()
    doc.nodes = [{ id: 'l', kind: 'line', x: 0, y: 0, width: 10, height: 1, stroke: '#112233', strokeWidth: 0 }]
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects a non-hex shape fill, like every other colour in the doc', () => {
    const doc = validDoc()
    doc.nodes = [{ id: 'r', kind: 'rect', x: 0, y: 0, width: 10, height: 10, fill: 'red' } as never]
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects out-of-range rotation and background transforms', () => {
    const rotated = validDoc()
    firstText(rotated).rotation = 200
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
    firstText(doc).fill = 'red'
    const result = safeParseCanvasDoc(doc)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.join()).toContain('fill')
  })

  it('rejects a version from the future rather than guessing at it', () => {
    expect(safeParseCanvasDoc({ ...validDoc(), version: 3 }).success).toBe(false)
  })

  it('rejects a missing background', () => {
    const doc: Record<string, unknown> = { ...validDoc() }
    delete doc.background
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects more than MAX_NODES nodes', () => {
    const doc = validDoc()
    doc.nodes = Array.from({ length: 41 }, (_, i) => textNode({ id: `l${i}` }))
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('rejects an unsupported font weight', () => {
    const doc = validDoc()
    firstText(doc).fontWeight = 300 as never
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('is the write gate: parseCanvasDoc refuses a v1 doc outright', () => {
    // Writers must never persist v1 again; only readers upgrade.
    expect(() => parseCanvasDoc({ ...validDoc(), version: 1 })).toThrow()
  })
})

describe('lockup ownership', () => {
  it('round-trips a mark-roled shape, which nothing else guards', () => {
    // The parity guards cover REQUIRED fields only, so `role?: 'mark'` on CanvasShapeNode typechecks
    // clean whether or not shapeNodeSchema mirrors it. Worse, the failure is silent rather than
    // loud: zod strips unknown keys, so a missing mirror would drop the role on save and leave a
    // rule the lockup sweep can never find again — an orphan that accumulates one per application.
    const rule = {
      id: 'rule-1',
      kind: 'line' as const,
      role: 'mark' as const,
      x: 96,
      y: 300,
      width: 200,
      height: 2,
      stroke: '#101010',
      strokeWidth: 2,
    }
    const parsed = parseCanvasDoc({ ...validDoc(), nodes: [rule] })
    expect(parsed.nodes[0]).toEqual(rule)
  })

  it('accepts the lockup text roles and still refuses an unknown one', () => {
    for (const role of ['kicker', 'tagline'] as const) {
      const parsed = parseCanvasDoc({ ...validDoc(), nodes: [textNode({ role })] })
      expect((parsed.nodes[0] as { role: string }).role).toBe(role)
    }
    const doc = { ...validDoc(), nodes: [textNode({ role: 'eyebrow' as never })] }
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })

  it('refuses any shape role other than mark', () => {
    // 'mark' is the only shape role there is; anything else must not slip through as a free string.
    const doc = {
      ...validDoc(),
      nodes: [
        { id: 'r', kind: 'rect', role: 'ornament', x: 0, y: 0, width: 10, height: 10, fill: '#000000' },
      ],
    }
    expect(safeParseCanvasDoc(doc).success).toBe(false)
  })
})

describe('additive-optional text effects', () => {
  it('round-trips every effect field unchanged', () => {
    // The `_forward`/`_backward` parity guards in doc-schema.ts cover REQUIRED fields only — an
    // optional field added to one side and not the other typechecks clean in BOTH directions
    // (excess-property checking does not apply to a cast). This assertion is the only thing that
    // fails if the zod schema and CanvasTextNode drift on these.
    const node = textNode({
      letterSpacing: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      stroke: '#FFFFFF',
      strokeWidth: 3,
    })
    const parsed = parseCanvasDoc({ ...validDoc(), nodes: [node] })
    expect(parsed.nodes[0]).toEqual(node)
  })

  it('rejects a blur big enough to hang the exporter', () => {
    // Canvas shadow blur costs O(area), so an unbounded value out of a corrupt doc is a hung
    // export rather than a cosmetic glitch.
    expect(() =>
      parseCanvasDoc({ ...validDoc(), nodes: [textNode({ shadowBlur: 1e9 })] })
    ).toThrow()
  })
})

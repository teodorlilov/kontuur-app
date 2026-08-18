import { describe, expect, it } from 'vitest'
import { markerBands } from '../highlight'

// fontSize 100 / lineHeight 1.2 → line box 120, band height 80, overshoot 30 — round numbers.
const layer = {
  width: 800,
  align: 'left' as const,
  fontSize: 100,
  lineHeight: 1.2,
  highlight: '#ABCDEF',
}

describe('markerBands', () => {
  it('returns no bands without a highlight colour', () => {
    expect(markerBands([{ width: 500 }], { ...layer, highlight: undefined })).toEqual([])
  })

  it('builds one pill per line, overshooting the glyphs and centred in the line box', () => {
    const bands = markerBands([{ width: 500 }, { width: 300 }], layer)
    expect(bands).toHaveLength(2)
    expect(bands[0]).toMatchObject({
      x: -30, // left-aligned glyphs start at 0; the band overshoots by 0.3 × fontSize
      y: 20, // (120 − 80) / 2
      width: 560, // 500 + 2 × 30
      height: 80,
      cornerRadius: 40,
      fill: '#ABCDEF',
    })
    expect(bands[1]!.y).toBe(120 + 20) // second line advances one full line box
  })

  it('offsets bands by alignment', () => {
    const centered = markerBands([{ width: 500 }], { ...layer, align: 'center' })
    expect(centered[0]!.x).toBe((800 - 500) / 2 - 30)
    const right = markerBands([{ width: 500 }], { ...layer, align: 'right' })
    expect(right[0]!.x).toBe(800 - 500 - 30)
  })

  it('tilts lines through a deterministic wobble cycle', () => {
    const lines = [{ width: 100 }, { width: 100 }, { width: 100 }, { width: 100 }]
    const rotations = markerBands(lines, layer).map((band) => band.rotation)
    expect(rotations).toEqual([-1.5, 1, -0.8, -1.5])
  })

  it('skips empty lines but keeps their vertical slot', () => {
    const bands = markerBands([{ width: 0 }, { width: 200 }], layer)
    expect(bands).toHaveLength(1)
    expect(bands[0]!.y).toBe(120 + 20) // the band belongs to line index 1
  })
})

describe('markerBands with letter spacing', () => {
  it("measures the band from the ink, not from Konva's trailing advance", () => {
    // Konva returns `measureText(text).width + letterSpacing * length` — the spacing after the
    // LAST glyph is counted but never drawn. Bands built from that number are one space too wide,
    // which pushes centred text off its own highlight.
    const layer = {
      width: 1000,
      align: 'center' as const,
      fontSize: 100,
      lineHeight: 1.2,
      highlight: '#ffee00',
      letterSpacing: 20,
    }
    const [band] = markerBands([{ width: 520 }], layer)
    const overshoot = 100 * 0.3

    // 520 measured − 20 trailing = 500 of actual ink.
    expect(band!.width).toBe(500 + overshoot * 2)
    expect(band!.x).toBe((1000 - 500) / 2 - overshoot)
  })

  it('is unchanged when there is no letter spacing', () => {
    const layer = {
      width: 1000,
      align: 'left' as const,
      fontSize: 100,
      lineHeight: 1.2,
      highlight: '#ffee00',
    }
    const [band] = markerBands([{ width: 520 }], layer)
    expect(band!.width).toBe(520 + 100 * 0.3 * 2)
  })

  it('drops a line whose ink is entirely trailing advance', () => {
    const layer = {
      width: 1000,
      align: 'left' as const,
      fontSize: 100,
      lineHeight: 1.2,
      highlight: '#ffee00',
      letterSpacing: 20,
    }
    expect(markerBands([{ width: 20 }], layer)).toEqual([])
  })
})

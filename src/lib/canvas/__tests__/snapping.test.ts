import { describe, expect, it } from 'vitest'
import { SNAP_TOLERANCE, collectSnapStops, snapRect, type SnapRect } from '../snapping'

const CANVAS = { w: 1000, h: 800 }
const rect = (x: number, y: number, width = 100, height = 50): SnapRect => ({ x, y, width, height })

describe('collectSnapStops', () => {
  it('always offers the canvas bounds and centre lines', () => {
    const stops = collectSnapStops([], CANVAS)
    expect(stops.vertical).toEqual([0, 500, 1000])
    expect(stops.horizontal).toEqual([0, 400, 800])
  })

  it('adds each sibling’s start, centre and end on both axes', () => {
    const stops = collectSnapStops([rect(200, 100)], CANVAS)
    expect(stops.vertical).toContain(200)
    expect(stops.vertical).toContain(250)
    expect(stops.vertical).toContain(300)
    expect(stops.horizontal).toContain(100)
    expect(stops.horizontal).toContain(125)
    expect(stops.horizontal).toContain(150)
  })
})

describe('snapRect', () => {
  const stops = collectSnapStops([rect(200, 100)], CANVAS)

  it('does not move a rect that is nowhere near a stop', () => {
    const result = snapRect(rect(613, 317), stops)
    expect(result).toMatchObject({ dx: 0, dy: 0 })
    expect(result.guides).toEqual([])
  })

  it('pulls a near-miss edge onto the sibling’s edge', () => {
    expect(snapRect(rect(203, 317), stops).dx).toBe(-3)
  })

  it('leaves an exact hit alone but still reports its guide', () => {
    const result = snapRect(rect(200, 317), stops)
    expect(result.dx).toBe(0)
    expect(result.guides).toContainEqual({ axis: 'vertical', position: 200 })
  })

  it('ignores a stop just outside the tolerance', () => {
    expect(snapRect(rect(200 + SNAP_TOLERANCE + 1, 317), stops).dx).toBe(0)
  })

  it('snaps to the canvas centre by the rect’s own centre', () => {
    // Centre lands at 452; the canvas centre line at 500 is well outside tolerance, so aim close.
    const result = snapRect(rect(448, 317), stops)
    expect(result.dx).toBe(2)
    expect(result.guides).toContainEqual({ axis: 'vertical', position: 500 })
  })

  it('snaps both axes independently in one gesture', () => {
    const result = snapRect(rect(197, 103), stops)
    expect(result).toMatchObject({ dx: 3, dy: -3 })
    expect(result.guides).toContainEqual({ axis: 'vertical', position: 200 })
    expect(result.guides).toContainEqual({ axis: 'horizontal', position: 100 })
  })

  it('picks whichever anchor sits closest, edge or centre', () => {
    // Left edge is 2 short of the sibling's start (200) and the right edge 4 past its end (300),
    // but the centre (251) is only 1 from the sibling's centre — so the centre wins.
    expect(snapRect(rect(198, 317, 106), stops).dx).toBe(-1)
  })

  it('reports every stop the winning move satisfies', () => {
    // A rect the same width as the sibling, offset slightly: snapping its left edge also lands its
    // centre and right edge on the sibling's, so all three guides draw.
    const result = snapRect(rect(202, 317, 100), stops)
    expect(result.dx).toBe(-2)
    const positions = result.guides
      .filter((guide) => guide.axis === 'vertical')
      .map((guide) => guide.position)
      .sort((a, b) => a - b)
    expect(positions).toEqual([200, 250, 300])
  })

  it('honours a tightened tolerance', () => {
    expect(snapRect(rect(203, 317), stops, 2).dx).toBe(0)
  })
})

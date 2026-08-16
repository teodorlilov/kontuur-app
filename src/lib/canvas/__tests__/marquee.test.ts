import { describe, expect, it } from 'vitest'
import { idsIntersectingRect, rectFromPoints, type MarqueeRect } from '../marquee'

const at = (x: number, y: number, width = 100, height = 100): MarqueeRect => ({
  x,
  y,
  width,
  height,
})

describe('rectFromPoints', () => {
  it('builds a rect dragged down-right', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 60, y: 90 })).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 70,
    })
  })

  it('normalises a rect dragged up-left', () => {
    expect(rectFromPoints({ x: 60, y: 90 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 70,
    })
  })

  it('handles a zero-size drag', () => {
    expect(rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
      width: 0,
      height: 0,
    })
  })
})

describe('idsIntersectingRect', () => {
  const candidates = [
    { id: 'a', rect: at(0, 0) },
    { id: 'b', rect: at(200, 0) },
    { id: 'c', rect: at(0, 200) },
  ]

  it('catches only what the band touches', () => {
    expect(idsIntersectingRect(candidates, at(50, 50, 200, 20))).toEqual(['a', 'b'])
  })

  it('catches a node the band merely overlaps, not just ones it contains', () => {
    expect(idsIntersectingRect(candidates, at(90, 90, 20, 20))).toEqual(['a'])
  })

  it('catches everything under a full sweep', () => {
    expect(idsIntersectingRect(candidates, at(-10, -10, 400, 400))).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing for a band in empty space', () => {
    expect(idsIntersectingRect(candidates, at(140, 140, 20, 20))).toEqual([])
  })

  it('does not count a shared edge as a touch', () => {
    // The band ends exactly where 'a' begins; a zero-area overlap should not select it.
    expect(idsIntersectingRect(candidates, at(-50, 0, 50, 50))).toEqual([])
  })
})

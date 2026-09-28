import { describe, expect, it } from 'vitest'
import { countDeltaVerdict, rateDeltaVerdict } from '../compute/delta-verdict'

describe('countDeltaVerdict', () => {
  it('has no verdict when either side was never captured', () => {
    expect(countDeltaVerdict(null, 10)).toEqual({ kind: 'none' })
    expect(countDeltaVerdict(10, null)).toEqual({ kind: 'none' })
  })

  it('keeps real moves loud and prints the percent on a base of 10 or more', () => {
    expect(countDeltaVerdict(317, 70)).toEqual({
      kind: 'move',
      diff: 247,
      pct: expect.closeTo(352.86, 1),
    })
    expect(countDeltaVerdict(116, 21)).toEqual({
      kind: 'move',
      diff: 95,
      pct: expect.closeTo(452.38, 1),
    })
  })

  it('clears the band but withholds the percent on a base under 10, zero included', () => {
    expect(countDeltaVerdict(11, 5)).toEqual({ kind: 'move', diff: 6, pct: null })
    expect(countDeltaVerdict(0, 5)).toEqual({ kind: 'move', diff: -5, pct: null })
    expect(countDeltaVerdict(52, 0)).toEqual({ kind: 'move', diff: 52, pct: null })
  })

  it('quiets changes inside the ±2√base noise band — the same rule at every account size', () => {
    expect(countDeltaVerdict(3, 1)).toEqual({ kind: 'quiet', diff: 2 })
    expect(countDeltaVerdict(70, 70)).toEqual({ kind: 'quiet', diff: 0 })
    expect(countDeltaVerdict(410, 400)).toEqual({ kind: 'quiet', diff: 10 })
  })

  it('handles a negative base (net followers) without inventing a percent', () => {
    expect(countDeltaVerdict(12, -4)).toEqual({ kind: 'move', diff: 16, pct: null })
  })
})

describe('rateDeltaVerdict', () => {
  it('colors the points only when both windows measured 1,000+ reach — ▼12.6pt off 644 stays quiet', () => {
    expect(rateDeltaVerdict(-12.6, 30_000, 644)).toEqual({ kind: 'quiet', diff: -12.6 })
    expect(rateDeltaVerdict(0.4, 30_000, 25_000)).toEqual({ kind: 'move', diff: 0.4, pct: null })
  })

  it('is none without a delta and quiet when nothing moved', () => {
    expect(rateDeltaVerdict(null, 30_000, 25_000)).toEqual({ kind: 'none' })
    expect(rateDeltaVerdict(0.01, 30_000, 25_000)).toEqual({ kind: 'quiet', diff: 0.01 })
  })
})

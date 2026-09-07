import { describe, expect, it } from 'vitest'
import { countDeltaVerdict, rateDeltaVerdict } from '../compute/delta-verdict'

describe('countDeltaVerdict', () => {
  it('has no verdict when either side was never captured', () => {
    expect(countDeltaVerdict(null, 10)).toEqual({ kind: 'none' })
    expect(countDeltaVerdict(10, null)).toEqual({ kind: 'none' })
  })

  /**
   * Likes 70 → 317 (band ±2√70 ≈ ±17) and saves 21 → 116: both clear the band by a wide margin
   * on a base of 10 or more, so the genuine story keeps its drama and its percentage.
   */
  it('keeps real moves loud and prints the percent on a solid base', () => {
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

  /**
   * Shares 5 → 11 is a real move, but one event on that base is worth 20%; comments 5 → 0 is
   * stated as −5 rather than "▼ 100.0%" theatrics; and off a zero base the band is 2√max(0,1)
   * = 2, with no percentage to state at all.
   */
  it('clears the band but withholds the percent on a grainy base', () => {
    expect(countDeltaVerdict(11, 5)).toEqual({ kind: 'move', diff: 6, pct: null })
    expect(countDeltaVerdict(0, 5)).toEqual({ kind: 'move', diff: -5, pct: null })
    expect(countDeltaVerdict(52, 0)).toEqual({ kind: 'move', diff: 52, pct: null })
  })

  /**
   * Replies 1 → 3 falls inside ±2√1, and 410 → 400 inside the ±40 a base of 400 earns — one
   * rule doing the work at both account sizes.
   */
  it('quiets changes inside the noise band — the same rule at every account size', () => {
    expect(countDeltaVerdict(3, 1)).toEqual({ kind: 'quiet', diff: 2 })
    expect(countDeltaVerdict(70, 70)).toEqual({ kind: 'quiet', diff: 0 })
    expect(countDeltaVerdict(410, 400)).toEqual({ kind: 'quiet', diff: 10 })
  })

  it('handles a negative base (net followers) without inventing a percent', () => {
    expect(countDeltaVerdict(12, -4)).toEqual({ kind: 'move', diff: 16, pct: null })
  })
})

describe('rateDeltaVerdict', () => {
  /** The parked case: ▼12.6pt off a 644-reach base is arithmetic, not evidence. */
  it('colors the points only when both windows measured real reach', () => {
    expect(rateDeltaVerdict(-12.6, 30_000, 644)).toEqual({ kind: 'quiet', diff: -12.6 })
    expect(rateDeltaVerdict(0.4, 30_000, 25_000)).toEqual({ kind: 'move', diff: 0.4, pct: null })
  })

  it('is none without a delta and quiet when nothing moved', () => {
    expect(rateDeltaVerdict(null, 30_000, 25_000)).toEqual({ kind: 'none' })
    expect(rateDeltaVerdict(0.01, 30_000, 25_000)).toEqual({ kind: 'quiet', diff: 0.01 })
  })
})

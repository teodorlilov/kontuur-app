import { describe, expect, it } from 'vitest'
import { countDeltaVerdict, rateDeltaVerdict } from '../delta-verdict'

describe('countDeltaVerdict', () => {
  it('has no verdict when either side was never captured', () => {
    expect(countDeltaVerdict(null, 10)).toEqual({ kind: 'none' })
    expect(countDeltaVerdict(10, null)).toEqual({ kind: 'none' })
  })

  it('keeps real moves loud and prints the percent on a solid base', () => {
    // Likes 70 → 317: band ±2√70 ≈ ±17, diff 247 clears it, base 70 ≥ 10.
    expect(countDeltaVerdict(317, 70)).toEqual({
      kind: 'move',
      diff: 247,
      pct: expect.closeTo(352.86, 1),
    })
    // Saves 21 → 116: the genuine story keeps its drama.
    expect(countDeltaVerdict(116, 21)).toEqual({
      kind: 'move',
      diff: 95,
      pct: expect.closeTo(452.38, 1),
    })
  })

  it('clears the band but withholds the percent on a grainy base', () => {
    // Shares 5 → 11: real move, but each event is worth 20% — no percent.
    expect(countDeltaVerdict(11, 5)).toEqual({ kind: 'move', diff: 6, pct: null })
    // Comments 5 → 0: stated as −5, never as "▼ 100.0%" theatrics.
    expect(countDeltaVerdict(0, 5)).toEqual({ kind: 'move', diff: -5, pct: null })
    // A zero base can still move — the old deltaPct rendered nothing here.
    expect(countDeltaVerdict(52, 0)).toEqual({ kind: 'move', diff: 52, pct: null })
  })

  it('quiets changes inside the noise band — the same rule at every account size', () => {
    // Replies 1 → 3: band ±2√1 = ±2, |2| does not clear it.
    expect(countDeltaVerdict(3, 1)).toEqual({ kind: 'quiet', diff: 2 })
    expect(countDeltaVerdict(70, 70)).toEqual({ kind: 'quiet', diff: 0 })
    // 410 → 400 on a big base: ±2√400 = ±40 absorbs it.
    expect(countDeltaVerdict(410, 400)).toEqual({ kind: 'quiet', diff: 10 })
  })

  it('handles a negative base (net followers) without inventing a percent', () => {
    expect(countDeltaVerdict(12, -4)).toEqual({ kind: 'move', diff: 16, pct: null })
  })
})

describe('rateDeltaVerdict', () => {
  it('colors the points only when both windows measured real reach', () => {
    // The parked case: ▼12.6pt off a 644-reach base stays quiet.
    expect(rateDeltaVerdict(-12.6, 30_000, 644)).toEqual({ kind: 'quiet', diff: -12.6 })
    expect(rateDeltaVerdict(0.4, 30_000, 25_000)).toEqual({ kind: 'move', diff: 0.4, pct: null })
  })

  it('is none without a delta and quiet when nothing moved', () => {
    expect(rateDeltaVerdict(null, 30_000, 25_000)).toEqual({ kind: 'none' })
    expect(rateDeltaVerdict(0.01, 30_000, 25_000)).toEqual({ kind: 'quiet', diff: 0.01 })
  })
})

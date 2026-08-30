import { describe, it, expect } from 'vitest'
import type { Palette } from '@/types/visual'
import {
  adjacencyWindow,
  deriveToneLadder,
  pickScheme,
  schemeFromSpec,
  schemeKey,
  type SchemeSpec,
} from '../color-scheme'
import { BRAND_STYLES, BRAND_STYLE_IDS } from '../brand-styles'
import { nameColor } from '../color-name'
import { parseHex, relativeLuminance, toHsl } from '../extract/color'

const lum = (hex: string) => relativeLuminance(parseHex(hex)!)
const hue = (hex: string) => toHsl(parseHex(hex)!).h

/** ЕВЕРЕСТ ИМОТИ before the detection fix: one hue at two tones. */
const ONE_HUE: Palette = {
  surface: '#FFFFFF',
  ink: '#707070',
  accent: '#A886CD',
  'accent-deep': '#6D5785',
  line: '#E0E0E0',
}

/** ЕВЕРЕСТ after it: a measured second colour 91° away. */
const TWO_HUE: Palette = { ...ONE_HUE, 'accent-deep': '#D53232' }

/** A brand whose page is itself a colour rather than paper. */
const DARK_PAGE: Palette = {
  surface: '#0E1A2B',
  ink: '#F2F2F2',
  accent: '#E8B84B',
  'accent-deep': '#A87F22',
  line: '#22334A',
}

describe('deriveToneLadder', () => {
  it('is deterministic', () => {
    expect(deriveToneLadder(ONE_HUE)).toEqual(deriveToneLadder(ONE_HUE))
  })

  it('keeps both brand colours untouched on their own rungs', () => {
    const l = deriveToneLadder(TWO_HUE)
    expect(l.primary).toBe('#A886CD')
    expect(l.secondary).toBe('#D53232')
  })

  /**
   * The measurement this whole model rests on: rotating this brand's hue by 24° moves it ΔE 10,
   * while dropping it to lightness 20 moves it ΔE 47. Tone is the lever, so the ladder has to
   * actually span one.
   */
  it('spans paper to near-ink', () => {
    const l = deriveToneLadder(ONE_HUE)
    expect(lum(l.paper)).toBeGreaterThan(0.8)
    expect(lum(l.tint)).toBeGreaterThan(lum(l.light))
    expect(lum(l.light)).toBeGreaterThan(lum(l.shade))
    expect(lum(l.shade)).toBeGreaterThan(lum(l.ink))
    expect(lum(l.ink)).toBeLessThan(0.06)
  })

  // Nothing is invented: derived rungs keep the hue of the brand colour they come from.
  it('derives every rung from a brand colour, never a new hue', () => {
    const l = deriveToneLadder(TWO_HUE)
    for (const rung of [l.tint, l.light])
      expect(Math.abs(hue(rung) - hue(l.primary))).toBeLessThan(2)
    for (const rung of [l.shade, l.ink])
      expect(Math.abs(hue(rung) - hue(l.secondary))).toBeLessThan(2)
  })

  // A dark-site brand still needs a light end, or the styles built on negative space have no ground.
  it('uses white as paper when the client’s own surface is dark', () => {
    expect(deriveToneLadder(DARK_PAGE).paper).toBe('#FFFFFF')
    expect(deriveToneLadder(ONE_HUE).paper).toBe('#FFFFFF')
  })
})

describe('pickScheme', () => {
  const SCHEMES: readonly SchemeSpec[] = [
    ['paper', 'primary'],
    ['tint', 'shade'],
    ['primary', 'ink'],
    ['secondary', 'tint'],
    ['shade', 'light'],
    ['ink', 'primary'],
  ]
  const ladder = deriveToneLadder(TWO_HUE)
  const base = { schemes: SCHEMES, ladder, recent: [], base: 'post-1', offset: 0 }
  const worn = (spec: SchemeSpec) => schemeFromSpec(ladder, spec)

  it('is stable for a post', () => {
    expect(pickScheme(base)).toEqual(pickScheme(base))
  })

  it('returns null when a style offers nothing', () => {
    expect(pickScheme({ ...base, schemes: [] })).toBeNull()
  })

  it('avoids the schemes recent posts are wearing', () => {
    const recent = [worn(SCHEMES[0]!), worn(SCHEMES[1]!)]
    const picked = pickScheme({ ...base, recent })!
    expect(recent.map(schemeKey)).not.toContain(schemeKey(picked))
  })

  /**
   * Graphic Editorial prints every post on paper and varies its ink, so two of its schemes share a
   * ground and are still plainly different posts. Comparing grounds alone called them the same and
   * excluded a colour the feed had never used.
   */
  it('tells two schemes apart when they share a ground', () => {
    const sameGround: readonly SchemeSpec[] = [
      ['paper', 'primary'],
      ['paper', 'ink'],
    ]
    const picked = pickScheme({
      ...base,
      schemes: sameGround,
      recent: [worn(sameGround[0]!)],
    })!
    expect(picked.accent).toBe(ladder.ink)
  })

  /**
   * The bug this replaced. A fixed window of three against a four-scheme style left ONE candidate,
   * `hashIndex` had nothing to choose between, and every post in a run came back identical — the
   * guard against repetition causing it.
   */
  it('never lets the adjacency guard starve the pool', () => {
    const four = SCHEMES.slice(0, 4)
    const allRecent = four.map(worn)
    const picked = new Set(
      [0, 1, 2, 3].map((offset) =>
        schemeKey(pickScheme({ ...base, schemes: four, recent: allRecent, offset })!)
      )
    )
    expect(picked.size).toBeGreaterThan(1)
  })

  /**
   * Wizard drafts resolve concurrently against one snapshot of history, so three independent hashes
   * collide about half the time. Consecutive offsets from ONE base cannot.
   *
   * The load-bearing words are "from one base", and this test passed for a week while the app was
   * broken because it happens to share `base` across the three calls, which the caller did not. The
   * route passed the per-DRAFT id as the base alongside the per-draft offset — two independent
   * draws, one shifted by a constant, which is still two independent draws. Measured over 20,000
   * simulated three-draft runs: 34.1% of runs repeated a scheme, against 34.0% with no offset at all.
   * A batch must share a base; only then does the offset mean anything.
   */
  it('spreads a batch across schemes, for every real style', () => {
    for (const id of BRAND_STYLE_IDS) {
      const schemes = BRAND_STYLES[id].variation.schemes
      const picks = [0, 1, 2].map((offset) => schemeKey(pickScheme({ ...base, schemes, offset })!))
      expect(new Set(picks).size, id).toBe(3)
    }
  })

  /** The other half of the same rule: different bases are independent, so offsets cannot save them. */
  it('does not pretend a per-item base plus a per-item offset is a spread', () => {
    const shared = [0, 1, 2].map((offset) => schemeKey(pickScheme({ ...base, offset })!))
    expect(new Set(shared).size).toBe(3)
    const perItem = ['draft-a', 'draft-b', 'draft-c'].map((b, i) =>
      schemeKey(pickScheme({ ...base, base: b, offset: i })!)
    )
    // Not asserting a collision — that would be asserting a coincidence. Asserting only that the
    // two are different mechanisms, so a future reader cannot conflate them again.
    expect(perItem.length).toBe(3)
    expect(shared.join('|')).not.toBe(perItem.join('|'))
  })

  it('still spreads different posts when every offset is zero', () => {
    const grounds = ['a', 'b', 'c', 'd', 'e', 'f'].map(
      (subject) => pickScheme({ ...base, base: subject })!.ground
    )
    expect(new Set(grounds).size).toBeGreaterThan(1)
  })
})

describe('schemeFromSpec', () => {
  const ladder = deriveToneLadder(TWO_HUE)

  it('resolves rung names against a client’s own ladder', () => {
    expect(schemeFromSpec(ladder, ['primary', 'ink'])).toEqual({
      ground: ladder.primary,
      accent: ladder.ink,
    })
  })
})

describe('nameColor', () => {
  it('names a colour by hue and weight', () => {
    expect(nameColor('#321F47')).toBe('near-black violet')
    expect(nameColor('#EAE2F3')).toBe('pale violet')
    expect(nameColor('#D53232')).toBe('vivid red')
  })

  // A colour with no chroma has no hue worth naming — calling it "grey violet" would be a lie.
  it('describes a neutral by weight alone', () => {
    expect(nameColor('#FFFFFF')).toBe('white')
    expect(nameColor('#111111')).toBe('near-black')
    expect(nameColor('#8C8C8C')).toBe('mid grey')
  })

  it('hands back the input when it is not a colour', () => {
    expect(nameColor('not-a-hex')).toBe('not-a-hex')
  })
})

/**
 * The fetch and the picker used to hold this number separately and disagree in silence:
 * `post-color` read three recent posts "because the grid is three tiles wide", while `pickScheme`
 * honoured `floor(n × 0.5)` — two, for both four-scheme styles, the default among them. One
 * definition now answers both, so the query reads exactly what the rotation can act on.
 */
describe('adjacencyWindow', () => {
  it('never excludes more than half a style’s schemes', () => {
    // Four minus three leaves one candidate, and a rotation with one candidate is not a rotation:
    // every post in a run comes back identical. This cap is what stopped that.
    expect(adjacencyWindow(4)).toBe(2)
    expect(adjacencyWindow(2)).toBe(1)
  })

  it('stops at a grid row however many schemes a style offers', () => {
    // Past three the constraint is the grid, not the pool — a repeat four posts back is not
    // adjacent to anything.
    expect(adjacencyWindow(8)).toBe(3)
    expect(adjacencyWindow(40)).toBe(3)
  })

  it('asks for nothing when there is nothing to avoid', () => {
    expect(adjacencyWindow(1)).toBe(0)
    expect(adjacencyWindow(0)).toBe(0)
  })

  it('agrees with what pickScheme actually honours', () => {
    // The property the split constants broke. `recent` longer than the window must not change the
    // answer — if it did, the rows the query fetches would be deciding something.
    const schemes = BRAND_STYLES['graphic-editorial'].variation.schemes
    const ladder = deriveToneLadder(TWO_HUE)
    const window = adjacencyWindow(schemes.length)
    const recent = schemes.map((spec) => schemeFromSpec(ladder, spec))
    const args = { schemes, ladder, base: 'post-1', offset: 0 }

    expect(pickScheme({ ...args, recent: recent.slice(0, window) })).toEqual(
      pickScheme({ ...args, recent: recent.slice(0, window + 1) })
    )
  })
})

import { describe, expect, it } from 'vitest'
import { canMakeAPost, postsAffordable } from '../post-allowance'
import { UNMETERED, type Allowance } from '../plans'

/**
 * Round numbers rather than the plan's, deliberately: this is the arithmetic's test, and tying it
 * to `PRO_PLAN` would make every price change look like a broken function.
 */
const TRIAL_AGENCY: Allowance = { draft: 60, image: 150, rewrite: 45 }
const NOTHING_USED: Allowance = { draft: 0, image: 0, rewrite: 0 }

function used(draft: number, image: number): Allowance {
  return { draft, image, rewrite: 0 }
}

describe('postsAffordable — the one number a run is decided by', () => {
  it('a single-image run is bound by the drafts, a six-slide carousel by its pictures', () => {
    // 60 drafts, 150 images. One picture each: the drafts run out first.
    expect(postsAffordable(TRIAL_AGENCY, NOTHING_USED, 1)).toEqual({ posts: 60, limiting: 'draft' })
    // Six pictures each: 150 / 6 = 25, and 35 drafts are stranded — the mismatch this exists for.
    expect(postsAffordable(TRIAL_AGENCY, NOTHING_USED, 6)).toEqual({ posts: 25, limiting: 'image' })
  })

  it('names the pool that is actually empty', () => {
    expect(postsAffordable(TRIAL_AGENCY, used(60, 20), 1)).toEqual({ posts: 0, limiting: 'draft' })
    expect(postsAffordable(TRIAL_AGENCY, used(3, 150), 1)).toEqual({ posts: 0, limiting: 'image' })
  })

  it('counts what is left, not what is used, and never goes below zero', () => {
    expect(postsAffordable(TRIAL_AGENCY, used(58, 100), 1)).toEqual({ posts: 2, limiting: 'draft' })
    // A counter past its quota — a settle that landed after the period turned — is spent, not negative.
    expect(postsAffordable(TRIAL_AGENCY, used(61, 151), 1)).toEqual({ posts: 0, limiting: 'draft' })
  })

  it('an unmetered workspace has no ceiling and nothing to name', () => {
    const house: Allowance = { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED }
    expect(postsAffordable(house, used(900, 900), 6)).toEqual({ posts: null, limiting: null })
    // One pool unmetered still answers from the other.
    expect(postsAffordable({ ...house, image: 150 }, used(900, 60), 3)).toEqual({
      posts: 30,
      limiting: 'image',
    })
  })

  it('a post owes at least one picture, whatever the slide count claims', () => {
    // A carousel with no slides is not a run; flooring at one keeps the ceiling honest rather
    // than dividing by zero and promising infinity.
    expect(postsAffordable(TRIAL_AGENCY, used(0, 140), 0)).toEqual({ posts: 10, limiting: 'image' })
  })

  it('canMakeAPost asks whether the cheapest post is still affordable', () => {
    expect(canMakeAPost(TRIAL_AGENCY, NOTHING_USED)).toBe(true)
    expect(canMakeAPost(TRIAL_AGENCY, used(60, 0))).toBe(false)
    expect(canMakeAPost(TRIAL_AGENCY, used(0, 150))).toBe(false)
  })
})

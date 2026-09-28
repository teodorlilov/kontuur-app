import { describe, expect, it } from 'vitest'
import {
  generationGate,
  poolLeft,
  postsAffordable,
  runCeiling,
  runShortfall,
} from '../post-allowance'
import { OWED_IMAGES_UNKNOWN } from '../copy'
import { entitlementFor } from '../entitlement'
import { UNMETERED, type Allowance } from '../plans'
import { paidRow, trialRow } from './fixtures'

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
  it('a single-image run is bound by the drafts, a six-slide carousel by its pictures — which asking each pool alone misses', () => {
    expect(postsAffordable(TRIAL_AGENCY, NOTHING_USED, 1)).toEqual({ posts: 60, limiting: 'draft' })
    expect(postsAffordable(TRIAL_AGENCY, NOTHING_USED, 6)).toEqual({ posts: 25, limiting: 'image' })
  })

  it('names the pool that is actually empty', () => {
    expect(postsAffordable(TRIAL_AGENCY, used(60, 20), 1)).toEqual({ posts: 0, limiting: 'draft' })
    expect(postsAffordable(TRIAL_AGENCY, used(3, 150), 1)).toEqual({ posts: 0, limiting: 'image' })
  })

  it('counts what is left, not what is used, and a counter past its quota is spent, never negative', () => {
    expect(postsAffordable(TRIAL_AGENCY, used(58, 100), 1)).toEqual({ posts: 2, limiting: 'draft' })
    expect(postsAffordable(TRIAL_AGENCY, used(61, 151), 1)).toEqual({ posts: 0, limiting: 'draft' })
  })

  it('an unmetered workspace has no ceiling and nothing to name; one unmetered pool answers from the other', () => {
    const house: Allowance = { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED }
    expect(postsAffordable(house, used(900, 900), 6)).toEqual({ posts: null, limiting: null })
    expect(postsAffordable({ ...house, image: 150 }, used(900, 60), 3)).toEqual({
      posts: 30,
      limiting: 'image',
    })
  })

  it('a post owes at least one picture whatever the slide count claims, so a zero never makes the ceiling endless', () => {
    expect(postsAffordable(TRIAL_AGENCY, used(0, 140), 0)).toEqual({ posts: 10, limiting: 'image' })
  })
})

describe('poolLeft', () => {
  it('is what is left of one pool, never below zero, and null when unmetered', () => {
    expect(poolLeft(TRIAL_AGENCY, used(10, 140), 'image')).toBe(10)
    expect(poolLeft(TRIAL_AGENCY, used(10, 151), 'image')).toBe(0)
    expect(poolLeft({ ...TRIAL_AGENCY, image: UNMETERED }, used(0, 900), 'image')).toBeNull()
  })
})

describe('generationGate — whether a new run may start at all', () => {
  const NOW = new Date('2026-09-14T12:00:00Z')
  const NONE_OWED = { posts: 0, images: 0 }

  it('asks nothing of a workspace that can still make the cheapest post', () => {
    const trial = entitlementFor(trialRow(NOW), NOW)
    expect(generationGate(trial, NOTHING_USED, NONE_OWED)).toEqual({ refusal: null, wayOut: true })
  })

  it('tells a workspace that cannot spend why, in the words of its own state, with a plan as the way out', () => {
    const grace = entitlementFor(trialRow(NOW, { trial_ends_at: '2026-09-12T00:00:00Z' }), NOW)
    expect(generationGate(grace, NOTHING_USED, NONE_OWED)).toEqual({
      refusal: expect.stringMatching(/Your trial ended on/),
      wayOut: true,
    })
    const unpaid = entitlementFor(
      paidRow(NOW, { subscription_status: 'past_due', past_due_since: '2026-08-01T00:00:00Z' }),
      NOW
    )
    expect(generationGate(unpaid, NOTHING_USED, NONE_OWED).refusal).toMatch(/last payment failed/)
  })

  it('refuses when the pictures earlier posts owe leave nothing for a new one — a single still fits the raw pool', () => {
    const trial = entitlementFor(trialRow(NOW), NOW)
    const limit = trial.limits.image
    expect(generationGate(trial, used(0, limit - 4), { posts: 1, images: 4 })).toEqual({
      refusal: '1 post still waiting for pictures needs 4 AI images; you have 4 left this period.',
      wayOut: true,
    })
  })

  it('refuses on owed pictures that could not be read, and offers no plan for it', () => {
    const trial = entitlementFor(trialRow(NOW), NOW)
    expect(generationGate(trial, NOTHING_USED, null)).toEqual({
      refusal: OWED_IMAGES_UNKNOWN,
      wayOut: false,
    })
  })

  it('lets an unmetered image pool generate when the owed pictures could not be read', () => {
    const trial = entitlementFor(trialRow(NOW), NOW)
    const house = { ...trial, limits: { ...trial.limits, image: UNMETERED } }
    expect(generationGate(house, NOTHING_USED, null)).toEqual({ refusal: null, wayOut: true })
  })
})

describe('runCeiling', () => {
  it('is what the format can afford less the briefs riding on top, and no ceiling when unmetered', () => {
    expect(runCeiling({ posts: 5, limiting: 'image' }, 2)).toBe(3)
    expect(runCeiling({ posts: 1, limiting: 'image' }, 2)).toBe(0)
    expect(runCeiling({ posts: null, limiting: null }, 2)).toBe(Infinity)
  })
})

describe('runShortfall', () => {
  it('is null for a run the period can pay for, or an unmetered one', () => {
    expect(runShortfall({ posts: 3, limiting: 'image' }, 3, 5)).toBeNull()
    expect(runShortfall({ posts: null, limiting: null }, 30, 5)).toBeNull()
  })

  it('prices a post in images as postsAffordable does — floored, never below one — or the wizard refuses what it offered', () => {
    const images = used(0, 145)
    const affordable = postsAffordable(TRIAL_AGENCY, images, 2.5)
    expect(affordable).toEqual({ posts: 2, limiting: 'image' })
    expect(runShortfall(affordable, 3, 2.5)).toEqual({ kind: 'image', needed: 6 })
    expect(runShortfall(postsAffordable(TRIAL_AGENCY, used(0, 150), 0), 1, 0)).toEqual({
      kind: 'image',
      needed: 1,
    })
  })

  it('names drafts in drafts when the draft pool binds', () => {
    expect(runShortfall({ posts: 1, limiting: 'draft' }, 4, 6)).toEqual({
      kind: 'draft',
      needed: 4,
    })
  })
})

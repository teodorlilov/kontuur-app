import { describe, expect, it } from 'vitest'
import {
  addBrandRefusal,
  allowanceUsedUp,
  allowanceWarning,
  cancelPlanConsequence,
  deleteWorkspaceNotice,
  deleteWorkspaceRefusal,
  draftsLeft,
  shellNotice,
} from '../copy'
import { entitlementFor } from '../entitlement'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'

const NOW = new Date('2026-09-14T12:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000)
const SOFIA = { timezone: 'Europe/Sofia' }

/** A trial row with a week left; the paid overrides turn it into an active subscription. */
const TRIAL_ROW: AgencyBillingColumns = {
  plan: 'trial',
  mode: 'agency',
  timezone: 'Europe/Sofia',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
  subscription_quantity: null,
  trial_ends_at: day(7).toISOString(),
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  past_due_since: null,
}
const PRO: Partial<AgencyBillingColumns> = {
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  subscription_quantity: 1,
  current_period_start: '2026-09-01T00:00:00Z',
  current_period_end: '2026-10-01T00:00:00Z',
}

describe('shellNotice', () => {
  it('says nothing for most of a trial, then warns in the last three days', () => {
    expect(
      shellNotice(
        { state: 'trial', trialEndsAt: day(10), graceEndsAt: null, endsOn: null, ...SOFIA },
        NOW
      )
    ).toBeNull()
    const late = shellNotice(
      { state: 'trial', trialEndsAt: day(2), graceEndsAt: null, endsOn: null, ...SOFIA },
      NOW
    )
    expect(late?.tone).toBe('warn')
    expect(late?.text).toMatch(/Your trial ends on 16 September/)
  })

  it('names both dates in the grace: when the trial ended and when publishing stops', () => {
    const grace = shellNotice(
      { state: 'trial_grace', trialEndsAt: day(-2), graceEndsAt: day(5), endsOn: null, ...SOFIA },
      NOW
    )
    expect(grace?.tone).toBe('bad')
    expect(grace?.text).toMatch(/ended on 12 September/)
    expect(grace?.text).toMatch(/until 19 September/)
  })

  it('writes the day out in the agency zone, not the server clock', () => {
    const lateEvening = new Date('2026-09-27T22:30:00Z')
    const notice = shellNotice(
      { state: 'trial', trialEndsAt: lateEvening, graceEndsAt: null, endsOn: null, ...SOFIA },
      new Date('2026-09-26T12:00:00Z')
    )
    expect(notice?.text).toMatch(/28 September/)
  })

  it('asks for a card by the day the grace ends, and says nothing when active or paused', () => {
    const failed = shellNotice(
      { state: 'past_due', trialEndsAt: null, graceEndsAt: day(4), endsOn: null, ...SOFIA },
      NOW
    )
    expect(failed?.tone).toBe('warn')
    expect(failed?.text).toMatch(/by 18 September/)
    expect(
      shellNotice(
        { state: 'active', trialEndsAt: null, graceEndsAt: null, endsOn: null, ...SOFIA },
        NOW
      )
    ).toBeNull()
    expect(
      shellNotice(
        { state: 'locked', trialEndsAt: day(-30), graceEndsAt: null, endsOn: null, ...SOFIA },
        NOW
      )
    ).toBeNull()
  })

  it('says when a cancelled plan ends, while it is still active', () => {
    const ending = shellNotice(
      { state: 'active', trialEndsAt: null, graceEndsAt: null, endsOn: day(10), ...SOFIA },
      NOW
    )
    expect(ending?.tone).toBe('warn')
    expect(ending?.text).toMatch(/Your plan ends on 24 September/)
  })
})

describe('the refusal sentences', () => {
  it('say what ran out, how much there was, and when it comes back', () => {
    expect(allowanceUsedUp('image', 120, 120, 1, { resetsOn: day(17), ...SOFIA })).toBe(
      "You've used all 120 AI images for this period. Resets on 1 October."
    )
    expect(allowanceUsedUp('draft', 58, 60, 3, { resetsOn: day(17), ...SOFIA })).toBe(
      'You have 2 AI drafts left this period and this needs 3. Resets on 1 October.'
    )
  })

  it('never promise a trial a reset — the way forward is a plan', () => {
    expect(allowanceUsedUp('draft', 60, 60, 3, { resetsOn: null, ...SOFIA })).toBe(
      "You've used all 60 AI drafts for this period. Choose a plan to keep generating."
    )
  })

  it('are the same words in the wizard before the server is asked', () => {
    expect(draftsLeft(5)).toBe('5 AI drafts left this period')
    expect(draftsLeft(1)).toBe('1 AI draft left this period')
    expect(draftsLeft(2, 3)).toBe('You have 2 AI drafts left this period and this needs 3.')
    expect(draftsLeft(0)).toBe("You've used all your AI drafts for this period.")
  })

  it('the 80 % bell names the reset date instead of a period key', () => {
    expect(allowanceWarning('draft', 160, 200, { resetsOn: day(17), ...SOFIA })).toBe(
      '160 of 200 AI drafts used this period. Resets on 1 October.'
    )
    expect(allowanceWarning('draft', 48, 60, { resetsOn: null, ...SOFIA })).toBe(
      '48 of 60 AI drafts used this period.'
    )
  })

  it('refuses a client past the cap with the plan, the cap, and the way past it', () => {
    const trial = entitlementFor(TRIAL_ROW, NOW)
    expect(addBrandRefusal(trial, 2)).toBeNull()
    expect(addBrandRefusal(trial, 3)).toBe('Trial includes 3 clients. Choose a plan to add more.')
    expect(
      addBrandRefusal(entitlementFor({ ...TRIAL_ROW, plan: 'pro', ...PRO }, NOW), 1)
    ).toBeNull()
    expect(addBrandRefusal(entitlementFor({ ...TRIAL_ROW, plan: 'house' }, NOW), 40)).toBeNull()
    expect(
      addBrandRefusal(
        entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-2).toISOString() }, NOW),
        0
      )
    ).toBe('Choose a plan to add clients.')
    expect(addBrandRefusal(entitlementFor({ ...TRIAL_ROW, mode: 'solo' }, NOW), 1)).toBe(
      'Trial includes one business. Choose a plan to add more.'
    )
  })
})

describe('the delete-workspace sentences', () => {
  it('refuses while a subscription is open and points at the portal, and says nothing otherwise', () => {
    expect(deleteWorkspaceRefusal({ canDelete: false })).toBe(
      'Cancel your plan first, under Plan & billing. You keep access until it ends, and can delete the workspace right after.'
    )
    expect(deleteWorkspaceRefusal({ canDelete: true })).toBeNull()
  })

  it('names the day a cancelled plan ends, in the same words the shell uses, and nothing for no plan', () => {
    const ending = entitlementFor(
      { ...TRIAL_ROW, ...PRO, plan: 'pro', cancel_at_period_end: true },
      NOW
    )
    expect(deleteWorkspaceNotice(ending)).toBe(
      'Your plan ends on 1 October; nothing more will be charged.'
    )
    expect(shellNotice(ending, NOW)?.text).toMatch(/^Your plan ends on 1 October/)
    expect(deleteWorkspaceNotice({ endsOn: null, ...SOFIA })).toBeNull()
  })
})

describe('cancelPlanConsequence', () => {
  it('names the period end in the shell’s words, what is charged, and what happens after', () => {
    const active = entitlementFor({ ...TRIAL_ROW, ...PRO, plan: 'pro' }, NOW)
    expect(cancelPlanConsequence(active)).toBe(
      'Your plan ends on 1 October and nothing more is charged. You keep full access until then; after that the workspace pauses with everything kept, and you can delete it any time.'
    )
    expect(cancelPlanConsequence({ resetsOn: null, ...SOFIA })).toMatch(
      /^Your plan ends with the current period and nothing more is charged\./
    )
  })
})

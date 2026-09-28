import { describe, expect, it } from 'vitest'
import {
  CLIENTS_ADMINS_ONLY,
  WORKSPACE_LOCKED,
  addBrandCost,
  addBrandGate,
  imagesWaiting,
  addBrandRefusal,
  allowanceUsedUp,
  allowanceWarning,
  cancelPlanConsequence,
  cannotSpendNotice,
  checkoutActivated,
  pausedNotice,
  REMINDER_COPY,
  checkoutSummary,
  clientRosterRefusal,
  deleteClientNotice,
  deleteWorkspaceNotice,
  deleteWorkspaceRefusal,
  postsLeft,
  shellNotice,
} from '../copy'
import { entitlementFor } from '../entitlement'
import { paidRow, trialRow } from './fixtures'
import { GRACE_DAYS } from '../plans'

const NOW = new Date('2026-09-14T12:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000)
const SOFIA = { timezone: 'Europe/Sofia' }

/** A trial with a week left; `paidRow` is the same workspace on an active subscription. */
const TRIAL_ROW = trialRow(NOW)

describe('shellNotice', () => {
  it('says nothing for most of a trial, then warns in the last three days', () => {
    expect(
      shellNotice(
        {
          state: 'trial',
          trialEndsAt: day(10),
          graceEndsAt: null,
          endsOn: null,
          ...SOFIA,
        },
        NOW
      )
    ).toBeNull()
    const late = shellNotice(
      {
        state: 'trial',
        trialEndsAt: day(2),
        graceEndsAt: null,
        endsOn: null,
        ...SOFIA,
      },
      NOW
    )
    expect(late?.tone).toBe('warn')
    expect(late?.text).toMatch(/Your trial ends on 16 September/)
  })

  it('names both dates in the grace: when the trial ended and when publishing stops', () => {
    const grace = shellNotice(
      {
        state: 'trial_grace',
        trialEndsAt: day(-2),
        graceEndsAt: day(5),
        endsOn: null,
        ...SOFIA,
      },
      NOW
    )
    expect(grace?.tone).toBe('bad')
    expect(grace?.text).toMatch(/ended on 12 September/)
    expect(grace?.text).toMatch(/until 19 September/)
  })

  it('writes the day out in the agency zone, not the server clock', () => {
    const lateEvening = new Date('2026-09-27T22:30:00Z')
    const notice = shellNotice(
      {
        state: 'trial',
        trialEndsAt: lateEvening,
        graceEndsAt: null,
        endsOn: null,
        ...SOFIA,
      },
      new Date('2026-09-26T12:00:00Z')
    )
    expect(notice?.text).toMatch(/28 September/)
  })

  it('asks for a card by the day the grace ends, and says nothing when active or paused', () => {
    const failed = shellNotice(
      {
        state: 'past_due',
        trialEndsAt: null,
        graceEndsAt: day(4),
        endsOn: null,
        ...SOFIA,
      },
      NOW
    )
    expect(failed?.tone).toBe('warn')
    expect(failed?.text).toMatch(/by 18 September/)
    expect(
      shellNotice(
        {
          state: 'active',
          trialEndsAt: null,
          graceEndsAt: null,
          endsOn: null,
          ...SOFIA,
        },
        NOW
      )
    ).toBeNull()
    expect(
      shellNotice(
        {
          state: 'locked',
          trialEndsAt: day(-30),
          graceEndsAt: null,
          endsOn: null,
          ...SOFIA,
        },
        NOW
      )
    ).toBeNull()
  })

  it('says when a cancelled plan ends, while it is still active', () => {
    const ending = shellNotice(
      {
        state: 'active',
        trialEndsAt: null,
        graceEndsAt: null,
        endsOn: day(10),
        ...SOFIA,
      },
      NOW
    )
    expect(ending?.tone).toBe('warn')
    expect(ending?.text).toMatch(/Your plan ends on 24 September/)
  })
})

describe('the refusal sentences', () => {
  it('say what ran out, how much there was, and when it comes back', () => {
    expect(
      allowanceUsedUp('image', 120, 120, 1, { resetsOn: day(17), paymentFailed: false, ...SOFIA })
    ).toBe("You've used all 120 AI images for this period. Resets on 1 October 2026.")
    expect(
      allowanceUsedUp('draft', 58, 60, 3, { resetsOn: day(17), paymentFailed: false, ...SOFIA })
    ).toBe('You have 2 AI drafts left this period and this needs 3. Resets on 1 October 2026.')
  })

  it('never promise a trial a reset — the way forward is a plan', () => {
    expect(
      allowanceUsedUp('draft', 60, 60, 3, { resetsOn: null, paymentFailed: false, ...SOFIA })
    ).toBe("You've used all 60 AI drafts for this period. Choose a plan to keep generating.")
  })

  it('are the same words in the wizard before the server is asked, naming the pool that ran out', () => {
    expect(postsLeft(5, 'draft')).toBe('5 posts left this period')
    expect(postsLeft(1, 'draft')).toBe('1 post left this period')
    expect(postsLeft(2, 'draft', 3)).toBe('You have 2 posts left this period and this needs 3.')
    expect(postsLeft(0, 'draft')).toBe("You've used all your AI drafts for this period.")
    expect(postsLeft(0, 'image')).toBe("You've used all your AI images for this period.")
  })

  it('the 80 % bell names the reset date instead of a period key', () => {
    expect(allowanceWarning('draft', 160, 200, { resetsOn: day(17), ...SOFIA })).toBe(
      '160 of 200 AI drafts used this period. Resets on 1 October 2026.'
    )
    expect(allowanceWarning('draft', 48, 60, { resetsOn: null, ...SOFIA })).toBe(
      '48 of 60 AI drafts used this period.'
    )
  })

  it('refuses a client past the cap with the plan, the cap, and the way past it', () => {
    const trial = entitlementFor(TRIAL_ROW, NOW)
    expect(addBrandRefusal(trial, 2, 'admin')).toBeNull()
    expect(addBrandRefusal(trial, 3, 'admin')).toBe(
      'Trial includes 3 clients. Choose a plan to add more.'
    )
    expect(addBrandRefusal(entitlementFor(paidRow(NOW), NOW), 1, 'admin')).toBeNull()
    expect(
      addBrandRefusal(entitlementFor({ ...TRIAL_ROW, plan: 'house' }, NOW), 40, 'admin')
    ).toBeNull()
    expect(
      addBrandRefusal(
        entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-2).toISOString() }, NOW),
        0,
        'admin'
      )
    ).toBe('Choose a plan to add clients.')
    expect(addBrandRefusal(entitlementFor({ ...TRIAL_ROW, mode: 'solo' }, NOW), 1, 'admin')).toBe(
      'Trial includes one business. Choose a plan to add more.'
    )
  })
})

describe('who may add or delete clients', () => {
  it('is an admin; anyone else gets the one sentence', () => {
    expect(clientRosterRefusal('admin')).toBeNull()
    expect(clientRosterRefusal('member')).toBe('Only admins can add or delete clients.')
    expect(clientRosterRefusal('')).toBe(CLIENTS_ADMINS_ONLY)
  })

  it('refuses a member before the cap, the count or a locked plan, none of which a member can act on', () => {
    const trial = entitlementFor(TRIAL_ROW, NOW)
    const paid = entitlementFor(paidRow(NOW), NOW)
    const locked = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-30).toISOString() }, NOW)
    expect(addBrandRefusal(trial, 0, 'member')).toBe(CLIENTS_ADMINS_ONLY)
    expect(addBrandRefusal(trial, 3, 'member')).toBe(CLIENTS_ADMINS_ONLY)
    expect(addBrandRefusal(paid, 0, 'member')).toBe(CLIENTS_ADMINS_ONLY)
    expect(addBrandRefusal(locked, 0, 'member')).toBe(CLIENTS_ADMINS_ONLY)
  })

  it('reaches every Add-client control through addBrandGate', () => {
    const paid = entitlementFor(paidRow(NOW, { subscription_quantity: 3 }), NOW)
    expect(addBrandGate(paid, 3, 'member').refusal).toBe(CLIENTS_ADMINS_ONLY)
    expect(addBrandGate(paid, 3, 'admin')).toEqual({
      refusal: null,
      note: addBrandCost(paid, 3),
      wayOut: true,
    })
  })

  it('offers Plan & billing as the way out of the plan’s refusal only, never to a member', () => {
    const trial = entitlementFor(TRIAL_ROW, NOW)
    const locked = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-30).toISOString() }, NOW)
    expect(addBrandGate(trial, 3, 'admin')).toMatchObject({
      refusal: 'Trial includes 3 clients. Choose a plan to add more.',
      wayOut: true,
    })
    expect(addBrandGate(locked, 0, 'admin')).toMatchObject({
      refusal: 'Choose a plan to add clients.',
      wayOut: true,
    })
    expect(addBrandGate(trial, 3, 'member')).toMatchObject({
      refusal: CLIENTS_ADMINS_ONLY,
      wayOut: false,
    })
    expect(addBrandGate(locked, 0, 'member')).toMatchObject({
      refusal: CLIENTS_ADMINS_ONLY,
      wayOut: false,
    })
    expect(addBrandGate(trial, 0, '').wayOut).toBe(false)
  })
})

describe('deleteClientNotice — what deleting a client does to the bill', () => {
  const paid = entitlementFor(paidRow(NOW, { subscription_quantity: 3 }), NOW)

  it('names one client fewer from the renewal, and keeps this period, while several remain', () => {
    expect(deleteClientNotice(paid, 3)).toBe(
      "Your plan bills one client fewer from its renewal on 1 October 2026. This period's allowance stays as it is."
    )
  })

  it('says the last client is still billed until the plan is cancelled', () => {
    expect(deleteClientNotice(paid, 1)).toBe(
      'Your plan keeps billing for one client until you cancel it under Plan & billing.'
    )
  })

  it('does not date the renewal while one has failed', () => {
    const renewalFailed = entitlementFor(
      paidRow(NOW, {
        subscription_quantity: 3,
        subscription_status: 'past_due',
        past_due_since: '2026-09-12T00:00:00Z',
      }),
      NOW
    )
    expect(deleteClientNotice(renewalFailed, 3)).toBe(
      "Your plan bills one client fewer from its next renewal. This period's allowance stays as it is."
    )
  })

  it('says nothing on the trial, on house, or once the plan is set to end', () => {
    expect(deleteClientNotice(entitlementFor(TRIAL_ROW, NOW), 2)).toBeNull()
    expect(deleteClientNotice(entitlementFor(trialRow(NOW, { plan: 'house' }), NOW), 2)).toBeNull()
    expect(
      deleteClientNotice(
        entitlementFor(paidRow(NOW, { subscription_quantity: 3, cancel_at_period_end: true }), NOW),
        3
      )
    ).toBeNull()
  })
})

describe('the delete-workspace sentences', () => {
  it('refuses while a subscription is open and points at the portal, and says nothing otherwise', () => {
    expect(deleteWorkspaceRefusal({ canDelete: false, paymentFailed: false })).toBe(
      'Cancel your plan first, under Plan & billing. You keep access until it ends, and can delete the workspace right after.'
    )
    expect(deleteWorkspaceRefusal({ canDelete: true, paymentFailed: false })).toBeNull()
  })

  it('names the day a cancelled plan ends, in the same words the shell uses, and nothing for no plan', () => {
    const ending = entitlementFor(paidRow(NOW, { cancel_at_period_end: true }), NOW)
    expect(deleteWorkspaceNotice(ending)).toBe(
      'Your plan ends on 1 October 2026; nothing more will be charged.'
    )
    expect(shellNotice(ending, NOW)?.text).toMatch(/^Your plan ends on 1 October/)
    expect(deleteWorkspaceNotice({ endsOn: null, ...SOFIA })).toBeNull()
  })
})

describe('cancelPlanConsequence', () => {
  it('names the period end in the shell’s words, what is charged, and what happens after', () => {
    const active = entitlementFor(paidRow(NOW), NOW)
    expect(cancelPlanConsequence(active)).toBe(
      'Your plan ends on 1 October 2026 and nothing more is charged. You keep full access until then; after that the workspace pauses and keeps everything you made. You can delete it any time.'
    )
    expect(
      cancelPlanConsequence({ plan: 'pro', paymentFailed: false, resetsOn: null, ...SOFIA })
    ).toMatch(/^Your plan ends with the current period and nothing more is charged\./)
  })
})

describe('checkoutActivated — the card once the plan is live', () => {
  const paid = entitlementFor(paidRow(NOW, { subscription_quantity: 3 }), NOW)

  it('names the plan, the clients, the month and the renewal, and where the invoice went', () => {
    const card = checkoutActivated(paid, { number: 1_000_000_002, email: 'owner@acme.bg' })
    expect(card.title).toBe('You’re on Pro')
    expect(card.facts).toEqual([
      { label: 'Clients', value: '3' },
      { label: 'A month', value: '€87.00 excl. VAT' },
      { label: 'Renews', value: '1 October 2026' },
    ])
    expect(card.text).toBe(
      'Invoice No. 1000000002 is on its way to owner@acme.bg and is listed under Invoices below.'
    )
  })

  it('promises the invoice without a number before the document exists, and counts a business for solo', () => {
    expect(checkoutActivated(paid, null).text).toBe(
      'Your invoice is on its way by email and will be listed under Invoices below.'
    )
    const solo = entitlementFor(paidRow(NOW, { mode: 'solo' }), NOW)
    expect(checkoutActivated(solo, null).facts[0]).toEqual({ label: 'Business', value: '1' })
  })
})

describe('cannotSpendNotice — why a workspace cannot spend, and the way back', () => {
  const failedRenewal = (daysAgo: number) =>
    entitlementFor(
      paidRow(NOW, {
        subscription_status: 'past_due',
        past_due_since: day(-daysAgo).toISOString(),
      }),
      NOW
    )

  it('says nothing while the workspace can spend — on the trial, paying, or inside a failed renewal’s grace', () => {
    expect(cannotSpendNotice(entitlementFor(TRIAL_ROW, NOW))).toBeNull()
    expect(cannotSpendNotice(entitlementFor(paidRow(NOW), NOW))).toBeNull()
    expect(cannotSpendNotice(failedRenewal(3))).toBeNull()
  })

  it('is the banner’s own sentence in the trial’s grace', () => {
    const grace = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-2).toISOString() }, NOW)
    expect(cannotSpendNotice(grace)).toEqual({
      text: shellNotice(grace, NOW)?.text,
      cta: 'Choose a plan',
    })
  })

  it('asks for the card, not a new plan, once a failed renewal has paused the workspace: its plan is still open', () => {
    expect(cannotSpendNotice(failedRenewal(9))).toEqual({
      text: 'Your workspace is paused because your last payment failed. Update your card in Plan & billing to continue.',
      cta: 'Update your card',
    })
  })

  it('offers a plan to a workspace paused for any other reason', () => {
    const paused = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-30).toISOString() }, NOW)
    expect(cannotSpendNotice(paused)).toEqual({ text: WORKSPACE_LOCKED, cta: 'Choose a plan' })
  })
})

describe('pausedNotice — which workspaces the wall replaces', () => {
  it('walls only a paused workspace, never the trial’s grace, whose posts still go out and pages stay open', () => {
    const grace = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-2).toISOString() }, NOW)
    expect(pausedNotice(grace)).toBeNull()
    expect(pausedNotice(entitlementFor(TRIAL_ROW, NOW))).toBeNull()
    const paused = entitlementFor({ ...TRIAL_ROW, trial_ends_at: day(-30).toISOString() }, NOW)
    expect(pausedNotice(paused)).toEqual(cannotSpendNotice(paused))
  })
})

describe('the failed-renewal sentences', () => {
  it('a refusal after a failed renewal asks for the card instead of naming a reset', () => {
    expect(
      allowanceUsedUp('draft', 50, 50, 1, { resetsOn: null, paymentFailed: true, ...SOFIA })
    ).toBe(
      "You've used all 50 AI drafts for this period. Update your card in Plan & billing to continue."
    )
  })

  it('deleting waits for the cancel, which ends at once — there is no access left to keep', () => {
    const refusal = deleteWorkspaceRefusal({ canDelete: false, paymentFailed: true })
    expect(refusal).toBe(
      'Cancel your plan first, under Plan & billing. It ends at once and the failed payment is not collected; you can delete the workspace right after.'
    )
    expect(refusal).not.toMatch(/keep access/)
  })

  it('cancelling says the plan ends now and the failed payment is not taken', () => {
    expect(
      cancelPlanConsequence({ plan: 'pro', paymentFailed: true, resetsOn: null, ...SOFIA })
    ).toBe(
      'Your plan ends now and the failed payment is not collected; the workspace pauses and keeps everything you made. You can delete it any time.'
    )
  })
})

describe('a house workspace that still pays', () => {
  it('cancelling says only that billing stops', () => {
    expect(
      cancelPlanConsequence({ plan: 'house', paymentFailed: false, resetsOn: day(10), ...SOFIA })
    ).toBe(
      'Billing for this workspace stops and nothing more is charged. The workspace keeps running as it is.'
    )
  })
})

describe('the pictures earlier posts still owe', () => {
  const DATED = {
    resetsOn: new Date('2026-10-01T00:00:00Z'),
    timezone: 'Europe/Sofia',
    paymentFailed: false,
  }
  const OWED = { posts: 3, images: 12 }

  it('names the waiting posts when they are what the pool cannot also cover: set aside, not empty', () => {
    expect(allowanceUsedUp('image', 38, 50, 1, DATED, OWED)).toBe(
      '3 posts still waiting for pictures need 12 AI images; you have 12 left this period. Resets on 1 October 2026.'
    )
    expect(postsLeft(0, 'image', 0, { left: 12, perPost: 1, owed: OWED })).toBe(
      '3 posts still waiting for pictures need 12 AI images; you have 12 left this period.'
    )
  })

  it('never says more is left than is', () => {
    const sentence = allowanceUsedUp('image', 45, 50, 1, DATED, OWED)
    expect(sentence).toMatch(/you have 5 left this period/)
    expect(postsLeft(0, 'image', 0, { left: 5, perPost: 1, owed: OWED })).toMatch(/you have 5 left/)
  })

  it('names the run’s need, not the waiting posts, when the run alone does not fit', () => {
    expect(allowanceUsedUp('image', 0, 50, 60, DATED, { posts: 1, images: 1 })).toBe(
      'You have 50 AI images left this period and this needs 60. Resets on 1 October 2026.'
    )
    expect(postsLeft(0, 'image', 3, { left: 50, perPost: 20, owed: { posts: 1, images: 1 } })).toBe(
      'You have 50 AI images left this period and this needs 60.'
    )
  })

  it('says what one post of a dearer format needs, not that every picture is used', () => {
    expect(postsLeft(0, 'image', 0, { left: 4, perPost: 5, owed: { posts: 0, images: 0 } })).toBe(
      'You have 4 AI images left this period and this needs 5.'
    )
    expect(postsLeft(0, 'image', 0, { left: 1, perPost: 5, owed: { posts: 0, images: 0 } })).toBe(
      'You have 1 AI image left this period and this needs 5.'
    )
  })

  it('says only the free figure when the waiting posts are not the reason', () => {
    expect(postsLeft(2, 'image', 0, { left: 20, perPost: 1, owed: OWED })).toBe(
      '2 posts left this period'
    )
    expect(allowanceUsedUp('draft', 50, 50, 1, DATED, OWED)).toMatch(
      /^You've used all 50 AI drafts/
    )
  })

  it('the visuals cron’s bell counts the posts it could not paint and says how the pictures come back', () => {
    expect(imagesWaiting(1, DATED)).toBe(
      "1 post in your review queue is waiting for pictures, and this period's AI images cannot cover it. Resets on 1 October 2026."
    )
  })
})

describe('addBrandCost — what one more client costs', () => {
  const paid = entitlementFor(paidRow(NOW, { subscription_quantity: 3 }), NOW)

  it('is free until renewal below the count paid for, and pro rata today from it', () => {
    expect(addBrandCost(paid, 2, NOW)).toBe(
      'Already paid for this period; adds €29.00 a month excl. VAT from renewal.'
    )
    expect(addBrandCost(paid, 3, NOW)).toBe(
      'Adds €29.00 a month excl. VAT, charged pro rata today.'
    )
  })

  it('stops calling a client already paid for once the paid period is over, renewal failed or not yet heard of', () => {
    const PRO_RATA = 'Adds €29.00 a month excl. VAT, charged pro rata today.'
    const renewalFailed = entitlementFor(
      paidRow(NOW, {
        subscription_quantity: 3,
        subscription_status: 'past_due',
        past_due_since: '2026-09-12T00:00:00Z',
      }),
      NOW
    )
    expect(addBrandCost(renewalFailed, 2, NOW)).toBe(PRO_RATA)
    expect(addBrandCost(paid, 2, new Date('2026-10-01T00:00:01Z'))).toBe(PRO_RATA)
  })

  it('says nothing on the trial or on house, where a client costs nothing', () => {
    expect(addBrandCost(entitlementFor(TRIAL_ROW, NOW), 0)).toBeNull()
    expect(addBrandCost(entitlementFor(trialRow(NOW, { plan: 'house' }), NOW), 0)).toBeNull()
  })
})

describe('the reminder emails', () => {
  it('name the grace in days from the plan table, never in a word like “a week”', () => {
    expect(REMINDER_COPY.payment_failed.detail).toContain(
      `After ${GRACE_DAYS} days without a payment`
    )
    expect(REMINDER_COPY.trial_ending.detail).toContain(`for ${GRACE_DAYS} days`)
    expect(REMINDER_COPY.payment_failed.detail).not.toMatch(/a week/)
  })
})

describe('checkoutSummary', () => {
  it('bills at least one client, the same count Checkout sells', () => {
    expect(checkoutSummary('agency', 0)).toBe(
      '€29.00 a month per client excl. VAT · 1 client today'
    )
    expect(checkoutSummary('agency', 3)).toBe(
      '€29.00 a month per client excl. VAT · 3 clients today'
    )
  })
})

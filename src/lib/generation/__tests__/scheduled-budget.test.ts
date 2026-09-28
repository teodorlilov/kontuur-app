import { describe, expect, it } from 'vitest'
import { createAgencyBudgets, planScheduledBatch } from '../scheduled-budget'
import type { Allowance } from '@/lib/billing/plans'

/** Round numbers: 20 drafts, 30 images. */
const LIMITS: Allowance = { draft: 20, image: 30, rewrite: 10 }
const NOTHING: Allowance = { draft: 0, image: 0, rewrite: 0 }

describe('planScheduledBatch', () => {
  it('trims the schedule to what the pools can pay for at the format', () => {
    expect(
      planScheduledBatch({ asked: 5, slotsPerPost: 10, limits: LIMITS, committed: NOTHING })
    ).toEqual({ total: 3, short: null })
    expect(
      planScheduledBatch({ asked: 2, slotsPerPost: 1, limits: LIMITS, committed: NOTHING })
    ).toEqual({ total: 2, short: null })
  })

  it('with no batch at all, is short of what one post at the format needs — never the whole schedule’s ask', () => {
    expect(
      planScheduledBatch({
        asked: 3,
        slotsPerPost: 5,
        limits: { draft: 25, image: 105, rewrite: 15 },
        committed: { draft: 10, image: 105, rewrite: 0 },
      })
    ).toEqual({ total: 0, short: { kind: 'image', needed: 5 } })
    expect(
      planScheduledBatch({
        asked: 3,
        slotsPerPost: 5,
        limits: LIMITS,
        committed: { draft: 20, image: 0, rewrite: 0 },
      })
    ).toEqual({ total: 0, short: { kind: 'draft', needed: 1 } })
  })
})

describe('AgencyBudgets', () => {
  it('plans a second client against what the first one took', () => {
    const budgets = createAgencyBudgets(
      new Map([['a1', { limits: LIMITS, committed: NOTHING, owed: { posts: 0, images: 0 } }]])
    )
    const first = budgets.plan('a1', 2, 10)
    budgets.take('a1', first.total, 10)
    expect(budgets.plan('a1', 2, 10)).toEqual({ total: 1, short: null })
  })

  it('gives back what did not land — the drafts, and the pictures a draft never written owes', () => {
    const budgets = createAgencyBudgets(
      new Map([['a1', { limits: LIMITS, committed: NOTHING, owed: { posts: 0, images: 0 } }]])
    )
    budgets.take('a1', 3, 10)
    expect(budgets.plan('a1', 1, 1)).toEqual({ total: 0, short: { kind: 'image', needed: 1 } })
    budgets.giveBack('a1', 2, 10)
    expect(budgets.of('a1')).toMatchObject({
      committed: { draft: 1, image: 0, rewrite: 0 },
      owed: { posts: 1, images: 10 },
    })
    expect(budgets.plan('a1', 2, 10)).toEqual({ total: 2, short: null })
  })

  it('counts a claimed batch’s pictures as owed, never as used, so a bell matches the meter', () => {
    const owed = { posts: 1, images: 5 }
    const budgets = createAgencyBudgets(
      new Map([
        [
          'a1',
          {
            limits: { draft: 25, image: 105, rewrite: 15 },
            committed: { draft: 5, image: 80, rewrite: 0 },
            owed,
          },
        ],
      ])
    )
    budgets.take('a1', 4, 5)
    expect(budgets.of('a1')).toMatchObject({
      committed: { draft: 9, image: 80 },
      owed: { posts: 5, images: 25 },
    })
    expect(owed).toEqual({ posts: 1, images: 5 })
  })

  it('sets aside the pictures every client of the workspace still owes, an unscheduled sibling’s included', () => {
    const budgets = createAgencyBudgets(
      new Map([['a1', { limits: LIMITS, committed: NOTHING, owed: { posts: 2, images: 25 } }]])
    )
    expect(budgets.plan('a1', 3, 1)).toEqual({ total: 3, short: null })
    expect(budgets.plan('a1', 3, 5)).toEqual({ total: 1, short: null })
  })

  it('throws for a workspace it was given no budget for', () => {
    expect(() => createAgencyBudgets(new Map()).plan('a9', 3, 1)).toThrow(
      'no generate budget for agency a9'
    )
  })
})

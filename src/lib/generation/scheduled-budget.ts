import type { OwedImages } from '@/lib/billing/copy'
import {
  committedWithOwed,
  postsAffordable,
  runCeiling,
  runShortfall,
} from '@/lib/billing/post-allowance'
import type { Allowance, AllowanceKind } from '@/lib/billing/plans'

/**
 * How big a due client's scheduled batch may be this tick, and — only when not one post fits — the
 * pool that binds and what one post at the client's format needs from it (`runShortfall`). That is
 * the smallest batch that could run, so the exhausted bell measured on it names the pictures
 * earlier posts owe whenever they are why nothing ran (`allowanceUsedUp`, src/lib/billing/copy.ts);
 * the whole schedule's ask would outgrow what is left and hide them. Null whenever a batch runs.
 */
interface ScheduledBatch {
  total: number
  short: { kind: AllowanceKind; needed: number } | null
}

/**
 * How many posts a due client's batch may be: what its schedule asks for, trimmed to what its
 * workspace can still pay for at the client's format — both pools, since a carousel is bound by
 * its pictures, measured against the committed usage with the pictures earlier posts owe set
 * aside, unscheduled clients' included. Pure; `AgencyBudgets` keeps the figures it reads.
 */
export function planScheduledBatch(input: {
  asked: number
  slotsPerPost: number
  limits: Allowance
  committed: Allowance
}): ScheduledBatch {
  const affordable = postsAffordable(input.limits, input.committed, input.slotsPerPost)
  const total = Math.min(input.asked, runCeiling(affordable, 0))
  return { total, short: total === 0 ? runShortfall(affordable, 1, input.slotsPerPost) : null }
}

/** One workspace's pools as the tick draws them down. */
interface AgencyBudget {
  limits: Allowance
  /** Committed usage: the counters' figure, plus the drafts of batches claimed this tick. */
  committed: Allowance
  /** The pictures posts still owe, the batches claimed this tick included. */
  owed: OwedImages
}

/**
 * Each workspace's pools across one generate tick, so a second client of the same agency is
 * planned against what the first one took. A claimed batch reserves its drafts (`take`) and its
 * posts then owe their pictures, which the visuals cron paints later — so they join `owed`, never
 * `committed.image`, and a bell reads the same figures as the meter. Once its run is finished, the
 * part that did not land is given back (`giveBack`), since a draft never written owes no picture.
 */
export interface AgencyBudgets {
  plan(agencyId: string, asked: number, slotsPerPost: number): ScheduledBatch
  take(agencyId: string, posts: number, slotsPerPost: number): void
  giveBack(agencyId: string, posts: number, slotsPerPost: number): void
  /** The pools as they stand — what an exhausted-allowance bell names, owed pictures included. */
  of(agencyId: string): AgencyBudget
}

/**
 * The tick's budgets from each workspace's limits, committed usage and owed pictures. The route
 * builds one for every workspace with a due client, so asking for any other throws.
 */
export function createAgencyBudgets(
  entries: ReadonlyMap<string, { limits: Allowance; committed: Allowance; owed: OwedImages }>
): AgencyBudgets {
  const budgets = new Map<string, AgencyBudget>(
    [...entries].map(([agencyId, entry]) => [
      agencyId,
      { limits: entry.limits, committed: { ...entry.committed }, owed: { ...entry.owed } },
    ])
  )
  const budgetOf = (agencyId: string) => {
    const budget = budgets.get(agencyId)
    if (!budget) throw new Error(`no generate budget for agency ${agencyId}`)
    return budget
  }
  const move = (agencyId: string, posts: number, slotsPerPost: number, sign: 1 | -1) => {
    const budget = budgetOf(agencyId)
    budget.committed.draft += sign * posts
    budget.owed.posts += sign * posts
    budget.owed.images += sign * posts * slotsPerPost
  }
  return {
    plan: (agencyId, asked, slotsPerPost) => {
      const budget = budgetOf(agencyId)
      return planScheduledBatch({
        asked,
        slotsPerPost,
        limits: budget.limits,
        committed: committedWithOwed(budget.committed, budget.owed),
      })
    },
    take: (agencyId, posts, slotsPerPost) => move(agencyId, posts, slotsPerPost, 1),
    giveBack: (agencyId, posts, slotsPerPost) => move(agencyId, posts, slotsPerPost, -1),
    of: budgetOf,
  }
}

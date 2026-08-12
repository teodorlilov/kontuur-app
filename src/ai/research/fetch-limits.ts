import { MAX_RSS_ITEMS } from '@/utils/constants'
import type { FetchLimits } from './types'

/**
 * Maximum characters of source full text attached to a topic for downstream grounding.
 * Shared by all source types — change here to affect all.
 */
export const SOURCE_FULL_TEXT_CAP = 4000

const BASE_COUNT = 5
const RSS_ITEMS_PER_SOURCE_MAX = 6
const WEB_BUDGET_MAX = 8000
const FILE_BUDGET_MAX = 6000
const MIN_BUDGET_RATIO = 0.4

/**
 * Budget for a run whose topics were supplied rather than chosen.
 *
 * Explicit rather than `computeFetchLimits(0)`, which returns
 * `websiteMaxPages: 0` — it scales the haystack to the number of posts, which is
 * right for a small batch and exactly backwards for one specific need. A brief
 * about "our new programme" is answered by the client's own site, so that page
 * budget cannot be zero, and the text budgets stay at full value because one
 * topic wants the most material per source, not the least.
 */
export const BRIEF_FETCH_LIMITS: FetchLimits = {
  websiteMaxPages: 2,
  rssItemsPerSource: 1,
  rssGlobalCap: 8,
  webBudget: WEB_BUDGET_MAX,
  fileBudget: FILE_BUDGET_MAX,
}

/** How many web results a briefs-only run aims for. */
export const BRIEF_WEB_RESULTS = 3

/**
 * Scale the haystack to the size of the batch — a one-post run should not pay to
 * gather material for five.
 *
 * BASE_COUNT is where scaling tops out, not the default run size (DEFAULT_RUN_SIZE
 * is smaller): a typical run is deliberately below full budget. Two limits opt out
 * of the ratio. Page count tracks `count` directly and keeps climbing past
 * BASE_COUNT to its own cap, because more posts want more distinct pages rather
 * than a fixed share of them. The text budgets floor at MIN_BUDGET_RATIO, because
 * below that a source arrives too truncated to ground a claim at all — which costs
 * more than the tokens it saves.
 */
export function computeFetchLimits(count: number): FetchLimits {
  const s = Math.min(Math.max(count, 1) / BASE_COUNT, 1)

  return {
    websiteMaxPages: Math.min(count, 10),
    rssItemsPerSource: Math.max(1, Math.round(RSS_ITEMS_PER_SOURCE_MAX * s)),
    rssGlobalCap: Math.max(4, Math.round(MAX_RSS_ITEMS * s)),
    webBudget: Math.round(WEB_BUDGET_MAX * Math.max(s, MIN_BUDGET_RATIO)),
    fileBudget: Math.round(FILE_BUDGET_MAX * Math.max(s, MIN_BUDGET_RATIO)),
  }
}

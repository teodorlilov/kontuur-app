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
 * Compute fetch limits scaled proportionally to the requested post count.
 * At count >= 5 (the default), all values match the original hardcoded defaults.
 * Below 5, everything scales down linearly — fewer subpages, fewer RSS items,
 * smaller prompt budgets.
 */
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

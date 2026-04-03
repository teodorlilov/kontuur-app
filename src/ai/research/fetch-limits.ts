import { MAX_RSS_ITEMS } from '@/utils/constants'
import type { FetchLimits } from './types'

/**
 * Maximum characters of source full text attached to a topic for downstream grounding.
 * Shared by all source types — change here to affect all.
 */
export const SOURCE_FULL_TEXT_CAP = 4000

const BASE_COUNT = 5
const RSS_ITEMS_PER_SOURCE_MAX = 4
const RSS_BUDGET_MAX = 4000
const WEB_BUDGET_MAX = 8000
const FILE_BUDGET_MAX = 6000
const MIN_BUDGET_RATIO = 0.4

/**
 * Compute fetch limits scaled proportionally to the requested post count.
 * At count >= 5 (the default), all values match the original hardcoded defaults.
 * Below 5, everything scales down linearly — fewer subpages, fewer RSS items,
 * smaller prompt budgets.
 */
export function computeFetchLimits(count: number, hasJinaKey = !!process.env.JINA_API_KEY): FetchLimits {
  const s = Math.min(Math.max(count, 1) / BASE_COUNT, 1)
  const maxPages = hasJinaKey ? 5 : 2

  return {
    websiteMaxPages: Math.max(1, Math.round(maxPages * s)),
    rssItemsPerSource: Math.max(1, Math.round(RSS_ITEMS_PER_SOURCE_MAX * s)),
    rssGlobalCap: Math.max(4, Math.round(MAX_RSS_ITEMS * s)),
    rssBudget: Math.round(RSS_BUDGET_MAX * Math.max(s, MIN_BUDGET_RATIO)),
    webBudget: Math.round(WEB_BUDGET_MAX * Math.max(s, MIN_BUDGET_RATIO)),
    fileBudget: Math.round(FILE_BUDGET_MAX * Math.max(s, MIN_BUDGET_RATIO)),
  }
}

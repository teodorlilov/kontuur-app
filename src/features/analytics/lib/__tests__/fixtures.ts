import type { PlatformPostMetricColumns } from '@/lib/queries/select-columns'

/**
 * Row shapes the analytics tests build on.
 *
 * `platform_post_metrics` carries seventeen columns and both networks' builder tests need one,
 * so both had written the whole skeleton out — the Facebook copy made when its builder arrived.
 * A shared skeleton with everything null is the honest base: a test that cares about a column
 * names it, and one that does not says nothing, which is exactly the NULL-means-unmeasured rule
 * the production code is written to.
 */
export function postMetricRow(
  overrides: Partial<PlatformPostMetricColumns> = {}
): PlatformPostMetricColumns {
  return {
    external_post_id: 'm1',
    post_id: null,
    media_type: null,
    media_product_type: null,
    permalink: null,
    thumbnail_url: null,
    caption: null,
    posted_at: null,
    reach: null,
    views: null,
    like_count: null,
    comments_count: null,
    saved: null,
    shares: null,
    total_interactions: null,
    follows: null,
    profile_visits: null,
    ...overrides,
  }
}

/**
 * A Page day series with every metric unserved.
 *
 * Meta omitting a day from a series means it served nothing for it, so "all five empty" is the
 * base every zipPageDays / fillPageWindow case starts from and then adds the one series it is
 * actually about.
 */
export const EMPTY_PAGE_SERIES = {
  page_follows: [],
  page_daily_follows_unique: [],
  page_daily_unfollows_unique: [],
  page_post_engagements: [],
  page_views_total: [],
}

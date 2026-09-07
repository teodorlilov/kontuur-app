import type { PlatformPostMetricColumns, PublishedPostPin } from '@/lib/queries/select-columns'

/**
 * Row shapes the analytics tests build on.
 *
 * Everything nullable starts null, which is the NULL-means-unmeasured rule the builders are
 * written to: a case that cares about a column names it, and one that does not says nothing —
 * so a fixture can never accidentally assert a zero the network never served.
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

/**
 * A published destination with the post it carried — the shape the pin query returns.
 *
 * `external_post_id` and `published_at` are the destination's (`post_publications`, migration
 * 20260838); only caption and post type come from `posts`. The nesting mirrors the embed, so a
 * caller passes both at the top level and this splits them.
 */
export function publishedPost(
  overrides: Partial<{
    id: string
    external_post_id: string | null
    caption: string | null
    published_at: string | null
    post_type: string
  }> = {}
): PublishedPostPin {
  const { id, caption, post_type, ...publication } = {
    id: 'p1',
    external_post_id: null,
    caption: null,
    published_at: null,
    post_type: 'single',
    ...overrides,
  }
  return {
    external_post_id: publication.external_post_id,
    published_at: publication.published_at,
    posts: { id, caption, post_type },
  }
}

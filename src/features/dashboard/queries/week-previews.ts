import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchImagesByPost, firstPublicUrl } from '@/lib/posts/fetch-post-images'
import { WEEK_PREVIEW_COLUMNS, type WeekPreviewColumns } from '@/lib/queries/select-columns'

/** What a My week card shows for a post: the caption behind its title, and its first image. */
export type WeekPostPreview = WeekPreviewColumns & { imageUrl: string | null }

/**
 * Captions and first images for the posts on a solo user's week, keyed by post id.
 *
 * The ids come out of the agency-scoped coverage entry (`getCachedClientWeekCoverage`), which is
 * what makes the admin client safe here — `post_images` RLS blocks the user-scoped client, and
 * the posts read is by id only. The image lookup lives inside the cached entry, the review
 * queue's pattern, so a hit skips both round trips.
 *
 * Keyed on the joined ids rather than the array: `unstable_cache` serialises its arguments, but
 * the React `cache()` wrapper compares them by reference, and a fresh array every render would
 * never dedupe. Degrades rather than throws — `fetchImagesByPost` throws on a query error, and a
 * week with no previews is a week of dated, stateful cards with no titles, not a 500.
 */
const fetchWeekPostPreviews = unstable_cache(
  async (idsKey: string): Promise<Record<string, WeekPostPreview>> => {
    const ids = idsKey.split(',')
    try {
      const supabase = createAdminSupabaseClient()
      const { data, error } = await supabase
        .from('posts')
        .select(WEEK_PREVIEW_COLUMNS)
        .in('id', ids)
      if (error) throw new Error(error.message)

      const imagesByPost = await fetchImagesByPost(ids)
      const previews: Record<string, WeekPostPreview> = {}
      for (const row of data) {
        previews[row.id] = { ...row, imageUrl: firstPublicUrl(imagesByPost, row.id) }
      }
      return previews
    } catch (err) {
      console.error('[dashboard] week previews failed:', err)
      return {}
    }
  },
  ['dashboard-week-previews'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

/** Previews for a set of post ids; nothing to look up returns nothing, without a round trip. */
export const getCachedWeekPostPreviews = cache(
  async (ids: string[]): Promise<Record<string, WeekPostPreview>> =>
    ids.length === 0 ? {} : fetchWeekPostPreviews([...ids].sort().join(','))
)

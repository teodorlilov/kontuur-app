import type { SupabaseClient } from '@supabase/supabase-js'
import type { PerformanceItem } from './types'
import { IG_POST_METRIC_COLUMNS, type IGPostMetricColumns } from '@/lib/queries/select-columns'

const PERFORMANCE_LOOKBACK_DAYS = 60
const PERFORMANCE_TOP_N = 5
const CAPTION_MAX_CHARS = 300

function buildEngagementSummary(post: IGPostMetricColumns): string {
  const parts = [`${post.like_count ?? 0} likes`, `${post.comments_count ?? 0} comments`]
  if (post.saved) parts.push(`${post.saved} saves`)
  if (post.shares) parts.push(`${post.shares} shares`)
  return parts.join(' · ')
}

/**
 * The client's own top-performing recent Instagram posts as research input —
 * audience-proven angles the pipeline proposes follow-ups to. Reads the
 * nightly-synced ig_post_metrics rows (one indexed query) instead of fanning
 * out to the Graph API from the hourly generate cron; any failure returns []
 * so the performance source can never block a research run.
 */
export async function fetchPerformanceItems(
  supabase: SupabaseClient,
  clientId: string
): Promise<PerformanceItem[]> {
  try {
    const since = new Date(
      Date.now() - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()
    const { data, error } = await supabase
      .from('ig_post_metrics')
      .select(IG_POST_METRIC_COLUMNS)
      .eq('client_id', clientId)
      .gte('posted_at', since)
      .not('caption', 'is', null)
      .order('total_interactions', { ascending: false, nullsFirst: false })
      .limit(PERFORMANCE_TOP_N)
    if (error) throw new Error(`ig_post_metrics read failed: ${error.message}`)
    // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
    const rows = (data ?? []) as unknown as IGPostMetricColumns[]

    const withCaptions = rows.filter((row) => !!row.caption?.trim())
    if (withCaptions.length === 0) return []

    // Recover the pillar for posts Postflow itself published; organic posts stay
    // caption-only. post_id is already the join the nightly sync maintains.
    const postIds = withCaptions.map((row) => row.post_id).filter((id): id is string => id !== null)
    const pillarByPostId = new Map<string, string>()
    if (postIds.length > 0) {
      const { data: publishedRows } = await supabase
        .from('posts')
        .select('id, pillar')
        .in('id', postIds)
      for (const row of publishedRows ?? []) {
        if (row.id && row.pillar) pillarByPostId.set(row.id as string, row.pillar as string)
      }
    }

    return withCaptions.map((row) => {
      const pillar = row.post_id ? pillarByPostId.get(row.post_id) : undefined
      return {
        caption: row.caption!.slice(0, CAPTION_MAX_CHARS),
        ...(pillar ? { pillar } : {}),
        engagementSummary: buildEngagementSummary(row),
        ...(row.permalink ? { permalink: row.permalink } : {}),
      }
    })
  } catch (err) {
    console.warn('[research] performance source unavailable:', err)
    return []
  }
}

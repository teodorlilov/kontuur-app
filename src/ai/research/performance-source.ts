import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchTopPerformingPosts } from '@/lib/meta/instagram-metrics'
import type { IGPost } from '@/types/api'
import type { PerformanceItem } from './types'

const PERFORMANCE_LOOKBACK_DAYS = 60
const PERFORMANCE_TOP_N = 5
const CAPTION_MAX_CHARS = 300

function isTokenExpired(expiresAt: string | null): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now()
}

function buildEngagementSummary(post: IGPost): string {
  const parts = [`${post.like_count} likes`, `${post.comments_count} comments`]
  if (post.saved) parts.push(`${post.saved} saves`)
  if (post.shares) parts.push(`${post.shares} shares`)
  return parts.join(' · ')
}

/**
 * The client's own top-performing recent Instagram posts as research input —
 * audience-proven angles the pipeline proposes follow-ups to. Gated on a
 * connected, unexpired Instagram account; any failure returns [] so the
 * performance source can never block a research run.
 */
export async function fetchPerformanceItems(
  supabase: SupabaseClient,
  clientId: string
): Promise<PerformanceItem[]> {
  try {
    const { data: connection } = await supabase
      .from('social_connections')
      .select('account_id, access_token, token_expires_at')
      .eq('client_id', clientId)
      .eq('platform', 'instagram')
      .maybeSingle()

    if (!connection?.account_id || !connection.access_token) return []
    if (isTokenExpired(connection.token_expires_at)) return []

    const until = new Date()
    const since = new Date(until.getTime() - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const topPosts = await fetchTopPerformingPosts(
      connection.account_id,
      connection.access_token,
      since.toISOString().slice(0, 10),
      until.toISOString().slice(0, 10),
      PERFORMANCE_TOP_N
    )

    const withCaptions = topPosts.filter((post) => !!post.caption?.trim())
    if (withCaptions.length === 0) return []

    // Recover the pillar for posts Postflow itself published; organic posts stay caption-only
    const mediaIds = withCaptions.map((post) => post.id)
    const { data: publishedRows } = await supabase
      .from('posts')
      .select('ig_media_id, pillar')
      .eq('client_id', clientId)
      .in('ig_media_id', mediaIds)
    const pillarByMediaId = new Map(
      (publishedRows ?? [])
        .filter((row) => row.ig_media_id && row.pillar)
        .map((row) => [row.ig_media_id as string, row.pillar as string])
    )

    return withCaptions.map((post) => ({
      caption: post.caption!.slice(0, CAPTION_MAX_CHARS),
      ...(pillarByMediaId.has(post.id) ? { pillar: pillarByMediaId.get(post.id) } : {}),
      engagementSummary: buildEngagementSummary(post),
      ...(post.permalink ? { permalink: post.permalink } : {}),
    }))
  } catch (err) {
    console.warn('[research] performance source unavailable:', err)
    return []
  }
}

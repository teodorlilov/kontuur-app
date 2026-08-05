import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { publishSingleImage, publishCarousel } from './publish-to-instagram'
import type { PostForPublish, InstagramConnection } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

type DuePost = PostForPublish & {
  scheduled_at: string
  platform: string
  status: string
  publish_claimed_at: string | null
}

const MAX_ATTEMPTS = 3
/** How far back a due post is still worth publishing. Older posts are marked failed so they surface. */
const PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000
/**
 * A claim this old belongs to a killed run — safe to reclaim. Measured from
 * publish_claimed_at, never from the slot: a run lives at most 300s
 * (maxDuration), so a 30-minute-old claim is provably dead, while slot-based
 * staleness would let an overlapping tick reclaim a post another run is
 * actively publishing and double-post it to Instagram.
 */
const STALE_CLAIM_MS = 30 * 60 * 1000
/**
 * Minimum gap between attempts. A failed attempt returns to 'scheduled', and
 * without spacing the every-5-min cron would burn all MAX_ATTEMPTS inside 15
 * minutes — shorter than a routine IG Graph incident or rate-limit window.
 */
const RETRY_SPACING_MS = 30 * 60 * 1000

export interface PublishSchedulerResult {
  processed: number
  published: number
  failed: number
}

/** Find and publish all posts that are due for scheduling. */
export async function publishDuePosts(): Promise<PublishSchedulerResult> {
  const admin = createAdminSupabaseClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS).toISOString()
  const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()

  // Surface posts that missed the window entirely (cron outage, repeated timeouts)
  // instead of leaving them stranded in 'scheduled' forever.
  await admin
    .from('posts')
    .update({ status: 'failed', publish_error: 'Missed publish window' })
    .in('status', ['scheduled', 'publishing'])
    .lt('scheduled_at', windowStart)

  const retrySpacingCutoff = new Date(now.getTime() - RETRY_SPACING_MS).toISOString()

  // Due posts (never attempted, or last attempt long enough ago), plus
  // 'publishing' posts whose claim is stale enough that their run must have
  // died. Oldest first, so the limit cannot starve the head of the queue.
  const { data: posts } = await admin
    .from('posts')
    .select(
      'id, caption, post_type, platform, status, scheduled_at, publish_attempts, publish_claimed_at, client_id, post_images(public_url, position)'
    )
    .lte('scheduled_at', now.toISOString())
    .gte('scheduled_at', windowStart)
    .lt('publish_attempts', MAX_ATTEMPTS)
    .or(
      [
        `and(status.eq.scheduled,or(publish_claimed_at.is.null,publish_claimed_at.lt.${retrySpacingCutoff}))`,
        `and(status.eq.publishing,publish_claimed_at.lt.${staleClaimCutoff})`,
        // Rows claimed before publish_claimed_at existed — slot-based staleness, one-time fallback.
        `and(status.eq.publishing,publish_claimed_at.is.null,scheduled_at.lt.${staleClaimCutoff})`,
      ].join(',')
    )
    .order('scheduled_at', { ascending: true })
    .limit(10)

  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  const duePosts = (posts as unknown as DuePost[]) ?? []

  const result: PublishSchedulerResult = { processed: 0, published: 0, failed: 0 }
  const grouped = groupByClientId(duePosts)

  for (const [clientId, clientPosts] of grouped) {
    const connection = await fetchInstagramConnection(admin, clientId)
    for (const post of clientPosts) {
      result.processed++
      const ok = await attemptPublish(admin, post, connection)
      if (ok) result.published++
      else result.failed++
    }
  }

  return result
}

function groupByClientId(posts: DuePost[]): Map<string, DuePost[]> {
  const map = new Map<string, DuePost[]>()
  for (const post of posts) {
    const group = map.get(post.client_id) ?? []
    group.push(post)
    map.set(post.client_id, group)
  }
  return map
}

/**
 * Atomically claim a post for publishing (compare-and-swap on status + attempt count).
 * Returns false if another run already claimed it — prevents double-publishing when
 * cron invocations overlap or a manual publish races the scheduler.
 */
async function claimPost(admin: SupabaseClient, post: DuePost): Promise<boolean> {
  const { data } = await admin
    .from('posts')
    .update({
      status: 'publishing',
      publish_attempts: post.publish_attempts + 1,
      publish_claimed_at: new Date().toISOString(),
    })
    .eq('id', post.id)
    .eq('status', post.status)
    .eq('publish_attempts', post.publish_attempts)
    .select('id')
  return !!data && data.length > 0
}

/** Attempt to publish a single post to Instagram. */
async function attemptPublish(
  admin: SupabaseClient,
  post: DuePost,
  connection: InstagramConnection | null
): Promise<boolean> {
  // Only Instagram publishing is implemented — fail other platforms loudly
  // rather than posting them to the wrong account. Case-insensitive: the UI
  // pickers store 'Instagram' while older writes store 'instagram', and a
  // strict compare would fail-final real IG posts (see TECH-DEBT 5.10).
  if (post.platform.toLowerCase() !== 'instagram') {
    await markFailedFinal(admin, post.id, `Publishing to ${post.platform} is not supported yet`)
    return false
  }

  if (!(await claimPost(admin, post))) return false
  const attempts = post.publish_attempts + 1

  // Claimed but unpublishable: count the attempt, so an imageless post gets
  // three spaced chances to receive art and then fails and surfaces — instead
  // of silently occupying the due window until the 24h sweep.
  if (post.post_images.length === 0) {
    await markFailed(admin, post.id, 'No images attached', attempts)
    return false
  }

  if (!connection) {
    await markFailed(admin, post.id, 'No Instagram account connected', attempts)
    return false
  }

  if (isTokenExpired(connection.token_expires_at)) {
    await markFailed(admin, post.id, 'Instagram token expired', attempts)
    return false
  }

  const imageUrls = post.post_images
    .sort((a, b) => a.position - b.position)
    .map((img) => img.public_url)

  const caption = post.caption ?? ''
  const result =
    imageUrls.length === 1
      ? await publishSingleImage(
          connection.account_id,
          connection.access_token,
          imageUrls[0]!,
          caption
        )
      : await publishCarousel(connection.account_id, connection.access_token, imageUrls, caption)

  if (result.success) {
    await markPublished(admin, post.id, result.mediaId ?? null)
    return true
  }

  await markFailed(admin, post.id, result.error ?? 'Unknown error', attempts)
  return false
}

async function fetchInstagramConnection(
  admin: SupabaseClient,
  clientId: string
): Promise<InstagramConnection | null> {
  const { data } = await admin
    .from('social_connections')
    .select('account_id, access_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .single()
  // Supabase select returns the exact fields we project; narrow to InstagramConnection
  return data as InstagramConnection | null
}

async function markPublished(
  admin: SupabaseClient,
  postId: string,
  mediaId: string | null
): Promise<void> {
  await admin
    .from('posts')
    .update({
      status: 'published',
      ig_media_id: mediaId,
      published_at: new Date().toISOString(),
      publish_error: null,
    })
    .eq('id', postId)
}

/** Record a failed attempt; back to 'scheduled' for retry until attempts run out. */
async function markFailed(
  admin: SupabaseClient,
  postId: string,
  error: string,
  attempts: number
): Promise<void> {
  await admin
    .from('posts')
    .update({
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'scheduled',
      publish_error: error,
      publish_attempts: attempts,
    })
    .eq('id', postId)
}

/** Fail immediately with no retries — for errors that cannot resolve on their own. */
async function markFailedFinal(
  admin: SupabaseClient,
  postId: string,
  error: string
): Promise<void> {
  await admin.from('posts').update({ status: 'failed', publish_error: error }).eq('id', postId)
}

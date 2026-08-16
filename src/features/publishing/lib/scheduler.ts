import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { PostStatus } from '@/lib/validation'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { publishSingleImage, publishCarousel } from './publish-to-instagram'
import type { PostForPublish, InstagramConnection } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SOCIAL_CONNECTION_AUTH_COLUMNS } from '@/lib/queries/select-columns'

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

/** A post whose media is live on Instagram but whose row never recorded it. */
interface UnreconciledPost {
  postId: string
  mediaId: string | null
}

interface PublishSchedulerResult {
  processed: number
  published: number
  failed: number
  /**
   * Publishes that reached Instagram but whose status write was lost. The row
   * still reads 'publishing', so the stale-claim reclaim below would publish
   * the same media again — these need reconciling within STALE_CLAIM_MS.
   */
  unreconciled: UnreconciledPost[]
  /** Lost status writes on posts that did not publish; they retry normally. */
  writeErrors: string[]
}

/** The publish-status columns this module writes. */
interface PublishStatusPatch {
  status?: string
  ig_media_id?: string | null
  published_at?: string
  publish_error?: string | null
  publish_attempts?: number
}

/**
 * Apply a publish-status patch, retrying once before giving up. Supabase returns
 * write errors instead of throwing, so an unchecked update here is invisible —
 * and a lost write after a successful Instagram publish is what turns a stale
 * claim into a duplicate post.
 */
async function patchPost(
  admin: SupabaseClient,
  postId: string,
  patch: PublishStatusPatch
): Promise<string | null> {
  const { error } = await admin.from('posts').update(patch).eq('id', postId)
  if (!error) return null
  const retry = await admin.from('posts').update(patch).eq('id', postId)
  return retry.error?.message ?? null
}

/** What one publish attempt did, so the run can report lost writes rather than drop them. */
interface AttemptOutcome {
  published: boolean
  /** False when another run held the claim — processed by that run, not a failure here. */
  claimed: boolean
  unreconciled?: UnreconciledPost
  writeError?: string
}

/** Find and publish all posts that are due for scheduling. */
export async function publishDuePosts(): Promise<PublishSchedulerResult> {
  const admin = createAdminSupabaseClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS).toISOString()
  const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()

  // Surface posts that missed the window entirely (cron outage, repeated timeouts)
  // instead of leaving them stranded in 'scheduled' forever.
  const { error: sweepError } = await admin
    .from('posts')
    .update({ status: 'failed', publish_error: 'Missed publish window' })
    .in('status', ['scheduled', 'publishing'] satisfies readonly PostStatus[])
    .lt('scheduled_at', windowStart)
  if (sweepError) throw new Error(`missed-window sweep failed: ${sweepError.message}`)

  const retrySpacingCutoff = new Date(now.getTime() - RETRY_SPACING_MS).toISOString()

  // Due posts (never attempted, or last attempt long enough ago), plus
  // 'publishing' posts whose claim is stale enough that their run must have
  // died. Oldest first, so the limit cannot starve the head of the queue.
  const { data: posts, error: dueError } = await admin
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

  if (dueError) throw new Error(`due-posts query failed: ${dueError.message}`)

  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  const duePosts = (posts as unknown as DuePost[]) ?? []

  const result: PublishSchedulerResult = {
    processed: 0,
    published: 0,
    failed: 0,
    unreconciled: [],
    writeErrors: [],
  }
  const grouped = groupByClientId(duePosts)

  for (const [clientId, clientPosts] of grouped) {
    const connection = await fetchInstagramConnection(admin, clientId)
    for (const post of clientPosts) {
      const outcome = await attemptPublish(admin, post, connection)
      if (!outcome.claimed) continue
      result.processed++
      if (outcome.published) result.published++
      else result.failed++
      if (outcome.unreconciled) result.unreconciled.push(outcome.unreconciled)
      if (outcome.writeError) result.writeErrors.push(outcome.writeError)
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
  const { data, error } = await admin
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
  // A DB error is not a lost race: treating it as one would silently skip the
  // post every tick. Propagate so the run reports it instead.
  if (error) throw new Error(`claim failed for post ${post.id}: ${error.message}`)
  return !!data && data.length > 0
}

/** Attempt to publish a single post to Instagram. */
async function attemptPublish(
  admin: SupabaseClient,
  post: DuePost,
  connection: InstagramConnection | null
): Promise<AttemptOutcome> {
  // Only Instagram publishing is implemented — fail other platforms loudly
  // rather than posting them to the wrong account. Case-insensitive: the UI
  // pickers store 'Instagram' while older writes store 'instagram', and a
  // strict compare would fail-final real IG posts (see TECH-DEBT 5.10).
  if (post.platform.toLowerCase() !== 'instagram') {
    const writeError = await markFailedFinal(
      admin,
      post.id,
      `Publishing to ${post.platform} is not supported yet`
    )
    return { published: false, claimed: true, writeError: writeError ?? undefined }
  }

  if (!(await claimPost(admin, post))) return { published: false, claimed: false }
  const attempts = post.publish_attempts + 1

  // Claimed but unpublishable: count the attempt, so an imageless post gets
  // three spaced chances to receive art and then fails and surfaces — instead
  // of silently occupying the due window until the 24h sweep.
  const blocker = !connection
    ? 'No Instagram account connected'
    : post.post_images.length === 0
      ? 'No images attached'
      : isTokenExpired(connection.token_expires_at)
        ? 'Instagram token expired'
        : null

  if (blocker || !connection) {
    const writeError = await markFailed(admin, post.id, blocker ?? 'Unknown error', attempts)
    return { published: false, claimed: true, writeError: writeError ?? undefined }
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
    const mediaId = result.mediaId ?? null
    const writeError = await markPublished(admin, post.id, mediaId)
    // The media is live on Instagram either way, so this counts as published —
    // but a lost write leaves the row claimable, which the run must report.
    return {
      published: true,
      claimed: true,
      unreconciled: writeError ? { postId: post.id, mediaId } : undefined,
      writeError: writeError ?? undefined,
    }
  }

  const writeError = await markFailed(admin, post.id, result.error ?? 'Unknown error', attempts)
  return { published: false, claimed: true, writeError: writeError ?? undefined }
}

async function fetchInstagramConnection(
  admin: SupabaseClient,
  clientId: string
): Promise<InstagramConnection | null> {
  // maybeSingle: a client with no Instagram connection is an expected state that
  // attemptPublish reports per post, not a query failure worth aborting the run.
  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .maybeSingle()
  if (error) throw new Error(`connection lookup failed for client ${clientId}: ${error.message}`)
  // Supabase select returns the exact fields we project; narrow to InstagramConnection
  return data as InstagramConnection | null
}

/** Record a successful publish. Returns a message if the write was lost, else null. */
async function markPublished(
  admin: SupabaseClient,
  postId: string,
  mediaId: string | null
): Promise<string | null> {
  const error = await patchPost(admin, postId, {
    status: 'published',
    ig_media_id: mediaId,
    published_at: new Date().toISOString(),
    publish_error: null,
  })
  if (error === null) return null
  return `post ${postId} published as media ${mediaId ?? 'unknown'} but the status write was lost: ${error}`
}

/**
 * Record a failed attempt; back to 'scheduled' for retry until attempts run out.
 * Returns a message if the write was lost, else null.
 */
async function markFailed(
  admin: SupabaseClient,
  postId: string,
  error: string,
  attempts: number
): Promise<string | null> {
  const writeError = await patchPost(admin, postId, {
    status: attempts >= MAX_ATTEMPTS ? 'failed' : 'scheduled',
    publish_error: error,
    publish_attempts: attempts,
  })
  if (writeError === null) return null
  return `post ${postId} failure write was lost: ${writeError}`
}

/**
 * Fail immediately with no retries — for errors that cannot resolve on their own.
 * Returns a message if the write was lost, else null.
 */
async function markFailedFinal(
  admin: SupabaseClient,
  postId: string,
  error: string
): Promise<string | null> {
  const writeError = await patchPost(admin, postId, { status: 'failed', publish_error: error })
  if (writeError === null) return null
  return `post ${postId} final-failure write was lost: ${writeError}`
}

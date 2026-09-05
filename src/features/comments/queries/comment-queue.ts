import 'server-only'

import { COMMENTABLE_PLATFORMS } from '@/lib/meta/networks'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import {
  COMMENTED_POST_COLUMNS,
  PLATFORM_COMMENT_COLUMNS,
  type CommentedPostColumns,
  type PlatformCommentColumns,
} from '@/lib/queries/select-columns'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { commentStatus, isOurs } from '@/features/comments/lib/comment-status'
import type { CommentGroup, QueuedComment, QueuedCommentReply } from '@/types/api'
import type { PlatformPostMetricsRow } from '@/types/index'

type Admin = ReturnType<typeof createAdminSupabaseClient>

/** The tag the sync and the moderation actions bust. */
export const PLATFORM_COMMENTS_TAG = 'platform-comments'

export interface CommentQueue {
  groups: CommentGroup[]
  /**
   * Client id → the handle a reply posts as, for the composer's "Reply as @…".
   *
   * Returned from here rather than fetched by the page, because this read already
   * has it: the account-scoping filter below needs the same `social_connections`
   * rows, and asking twice for one field would be a second query answering a
   * question already answered.
   */
  accountNames: Record<string, string | null>
  /**
   * Posts Instagram says have comments, from which we hold none.
   *
   * This is the Advanced Access wall made visible. With Standard Access the
   * `/{media}/comments` edge answers HTTP 200 with an empty array while
   * `comments_count` reads correctly — nothing throws, nothing errors, and a queue
   * that only knew about stored rows would render a confident "all caught up" over
   * a backlog of real questions.
   *
   * Counted by comparing the nightly metrics capture against what the comments sync
   * managed to store, so it costs one query and no new column. It reads slightly
   * high for a post published since the last nightly run, which is the harmless
   * direction: it says "we may not be seeing everything", never the reverse.
   */
  withheldPostCount: number
}

const EMPTY: CommentQueue = { groups: [], accountNames: {}, withheldPostCount: 0 }

/**
 * Everything said under this agency's posts, grouped by the post it was said under.
 *
 * Reads Postgres and nothing else — the request path makes zero Graph API calls, the
 * same rule the analytics report holds to. Instagram is reached by the cron, on a
 * budget, thirty minutes at a time.
 *
 * The image and post lookups live INSIDE the cached entry rather than beside it:
 * they depend on the ids this query returns, so a cache hit skips all three round
 * trips instead of just the first. Same reasoning as `getCachedReviewQueue`, whose
 * shape this follows.
 *
 * 30s, matching the review queue, because this is a surface someone actively works
 * through — and the actions bust the tag outright, so the TTL only governs comments
 * arriving from outside.
 */
const fetchCommentQueue = unstable_cache(
  async (agencyId: string): Promise<CommentQueue> => {
    const clients = await getCachedAgencyClients(agencyId)
    if (clients.length === 0) return EMPTY

    const admin = createAdminSupabaseClient()
    const clientIds = clients.map((client) => client.id)
    const nameByClient = new Map(clients.map((client) => [client.id, client.name]))

    /**
     * Narrow lookup, inline by convention: select-columns.ts covers full-row selects.
     * Deliberately not SOCIAL_CONNECTION_AUTH_COLUMNS — that one carries a live
     * access token, and a read that only needs to know which account is connected
     * and what it is called has no business holding one.
     */
    const { data: connectionData, error: connectionError } = await admin
      .from('social_connections')
      .select('client_id, platform, account_id, account_name')
      .in('platform', COMMENTABLE_PLATFORMS)
      .in('client_id', clientIds)
    if (connectionError) {
      console.error('[comments] connection query failed:', connectionError.message)
      return EMPTY
    }
    /**
     * Keyed on (client, PLATFORM), not on client alone.
     *
     * A client can have both networks connected, which is two rows — and a map keyed by client
     * kept whichever arrived last, so every comment from the other network failed the scoping
     * filter below and vanished from the queue.
     */
    const connections = new Map(
      (connectionData ?? []).flatMap((row) =>
        row.client_id ? [[connectionKey(row.client_id, row.platform), row] as const] : []
      )
    )
    // No connected account means nothing to scope comments to, and the withheld
    // count would be meaningless too — there is no network here to withhold them.
    if (connections.size === 0) return EMPTY

    const { data: commentData, error: commentError } = await admin
      .from('platform_comments')
      .select(PLATFORM_COMMENT_COLUMNS)
      .in('client_id', clientIds)
      .order('commented_at', { ascending: true })
    if (commentError) {
      console.error('[comments] comment query failed:', commentError.message)
      return EMPTY
    }

    /**
     * INVARIANT (20260825/20260826): only rows stamped with the account the client is
     * connected to RIGHT NOW. A client can be repointed at a different account, and the OAuth
     * callback purges the old account's rows — this filter is the belt to that pair of braces,
     * and it is why the queue cannot show one account's audience under another's name.
     *
     * Filtered here rather than in the query because the condition is a (client, platform,
     * account) triple per client, which PostgREST cannot express as one `in`.
     */
    const rows = (commentData ?? []).filter(
      (row) =>
        connections.get(connectionKey(row.client_id, row.platform))?.account_id ===
        row.platform_account_id
    )

    const postIds = [...new Set(rows.flatMap((row) => (row.post_id ? [row.post_id] : [])))]
    const mediaIds = [...new Set(rows.map((row) => row.external_post_id))]

    const [posts, images, mediaFacts, withheldPostCount] = await Promise.all([
      fetchPosts(admin, postIds),
      // Admin-client read: post_images RLS blocks the user-scoped client. Safe because
      // these ids came from comment rows already scoped to this agency's clients.
      fetchImagesByPost(postIds),
      fetchMediaFacts(admin, clientIds, mediaIds),
      countWithheldPosts(admin, clientIds, new Set(mediaIds)),
    ])

    return {
      groups: assemble(rows, { nameByClient, connections, posts, images, mediaFacts }),
      accountNames: Object.fromEntries(
        [...connections].map(([clientId, row]) => [clientId, row.account_name])
      ),
      withheldPostCount,
    }
  },
  ['comment-queue'],
  { revalidate: 30, tags: [PLATFORM_COMMENTS_TAG] }
)

export const getCachedCommentQueue = cache(fetchCommentQueue)

/** The stored row, as this read projects it — derived from the constant it selects. */
/** (client, platform) — the pair a connection is scoped by, since a client may have several. */
function connectionKey(clientId: string, platform: string): string {
  return `${clientId}::${platform}`
}

type CommentRow = PlatformCommentColumns

/**
 * What the nightly metrics sync already knows about a media, reused rather than
 * re-stored.
 *
 * Derived rather than restated: hand-writing these three fields is a mirror of an
 * `platform_post_metrics` row, and `row-mirrors.test.ts` exists because that pattern
 * drifted from its table for three months without anything noticing.
 */
type MediaFacts = Pick<
  PlatformPostMetricsRow,
  'caption' | 'thumbnail_url' | 'permalink' | 'posted_at'
>

async function fetchPosts(
  admin: Admin,
  postIds: string[]
): Promise<Map<string, CommentedPostColumns>> {
  if (postIds.length === 0) return new Map()
  const { data, error } = await admin.from('posts').select(COMMENTED_POST_COLUMNS).in('id', postIds)
  if (error) throw new Error(`commented posts query failed: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.id, row]))
}

/**
 * Caption, thumbnail and permalink for media we did NOT publish from Kontuur.
 *
 * The agency may have posted from the Instagram app before connecting, and those
 * posts still collect comments worth answering. `platform_post_metrics` already holds
 * exactly these three facts for every media in the same 30-day window, written by
 * the nightly sync — so the alternative was copying them onto every comment row,
 * which would have meant the same fact stored twice and drifting.
 *
 * Nightly, so a post published in the last few hours may have no row yet. The group
 * simply renders without an image until tonight, which is a smaller cost than a
 * second copy of the media table.
 */
async function fetchMediaFacts(
  admin: Admin,
  clientIds: string[],
  mediaIds: string[]
): Promise<Map<string, MediaFacts>> {
  if (mediaIds.length === 0) return new Map()
  // Narrow lookup, inline by convention — PLATFORM_POST_METRIC_COLUMNS pulls 18 columns
  // for the analytics report and this needs three.
  const { data, error } = await admin
    .from('platform_post_metrics')
    .select('external_post_id, caption, thumbnail_url, permalink, posted_at')
    .in('client_id', clientIds)
    .in('external_post_id', mediaIds)
  if (error) throw new Error(`media facts query failed: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.external_post_id, row]))
}

/**
 * How many posts have comments we were not given.
 *
 * `platform_post_metrics.comments_count` comes from the media itself, which Instagram
 * reports honestly even under Standard Access — it is the comment BODIES it
 * withholds. So a post with a non-zero count and no stored comment rows is the
 * signature of missing Advanced Access, and it is the one thing that distinguishes
 * that state from a genuinely quiet week.
 */
async function countWithheldPosts(
  admin: Admin,
  clientIds: string[],
  mediaWithStoredComments: Set<string>
): Promise<number> {
  const { data, error } = await admin
    .from('platform_post_metrics')
    .select('external_post_id, comments_count')
    .in('client_id', clientIds)
    /**
     * Instagram's, and named here rather than left open.
     *
     * "Withheld" is a specific Instagram state — it answers 200 with an empty list until the app
     * holds Advanced Access for `instagram_business_manage_comments` — and the banner this feeds
     * explains that mechanism by name. Left unscoped it counted Facebook Page posts as comments
     * Instagram was withholding, which is two wrong things in one sentence.
     *
     * Whether Facebook withholds under Standard Access is NOT established: the probe ran as
     * someone holding a role on the Meta app, which is exactly the case Instagram exempts. When
     * that is known, this becomes a per-network count and the copy stops naming one.
     */
    .eq('platform', 'instagram')
    .gt('comments_count', 0)
  if (error) {
    // A failure here costs an explanation, not the page. Falling back to 0 renders
    // the queue without the banner, which is the same thing a healthy account sees.
    console.error('[comments] withheld count query failed:', error.message)
    return 0
  }
  return (data ?? []).filter((row) => !mediaWithStoredComments.has(row.external_post_id)).length
}

/**
 * Rows to groups.
 *
 * Replies are stored as ordinary rows carrying `parent_id`, so this threads them
 * onto their parent and then asks `commentStatus` the one question the surface
 * cares about. A reply whose parent is missing — deleted upstream between one sync
 * and the next — is dropped rather than promoted to top level: showing an answer
 * with no question is worse than showing nothing.
 */
function assemble(
  rows: CommentRow[],
  context: {
    nameByClient: Map<string, string>
    connections: Map<string, { account_name: string | null }>
    posts: Map<string, CommentedPostColumns>
    images: Map<string, Array<{ publicUrl: string }>>
    mediaFacts: Map<string, MediaFacts>
  }
): CommentGroup[] {
  const repliesByParent = new Map<string, CommentRow[]>()
  for (const row of rows) {
    if (!row.parent_id) continue
    const existing = repliesByParent.get(row.parent_id)
    if (existing) existing.push(row)
    else repliesByParent.set(row.parent_id, [row])
  }

  const groups = new Map<string, CommentGroup>()
  for (const row of rows) {
    if (row.parent_id) continue

    const accountName = context.connections.get(row.client_id)?.account_name ?? null
    const replies: QueuedCommentReply[] = (repliesByParent.get(row.id) ?? []).map((reply) => ({
      id: reply.id,
      authorUsername: reply.author_username,
      text: reply.text,
      commentedAt: reply.commented_at,
      fromUs: isOurs(reply.author_username, accountName),
    }))

    const comment: QueuedComment = {
      id: row.id,
      authorUsername: row.author_username,
      text: row.text,
      commentedAt: row.commented_at,
      likeCount: row.like_count,
      hidden: row.hidden,
      status: commentStatus(
        row,
        replies.map((reply) => ({ authorUsername: reply.authorUsername })),
        accountName
      ),
      replies,
    }

    const group = groups.get(row.external_post_id)
    if (group) {
      group.comments.push(comment)
      continue
    }

    const post = row.post_id ? context.posts.get(row.post_id) : undefined
    const facts = context.mediaFacts.get(row.external_post_id)
    groups.set(row.external_post_id, {
      igMediaId: row.external_post_id,
      platform: row.platform,
      postId: row.post_id,
      clientId: row.client_id,
      clientName: context.nameByClient.get(row.client_id) ?? 'Unknown client',
      // Our own caption first: it is what the agency wrote and what they will
      // recognise. Instagram's copy is the fallback for posts we did not publish.
      caption: post?.caption ?? facts?.caption ?? null,
      pillar: post?.pillar ?? null,
      // The destination's, not the post's. `platform_post_metrics.posted_at` is the same
      // instant recorded by the nightly sync, and it is already loaded here — reaching
      // for the publication row as well would be a second query for one timestamp.
      publishedAt: facts?.posted_at ?? null,
      imageUrl:
        (row.post_id ? context.images.get(row.post_id)?.[0]?.publicUrl : null) ??
        facts?.thumbnail_url ??
        null,
      permalink: facts?.permalink ?? null,
      comments: [comment],
    })
  }

  // Newest conversation first — the post someone just commented on is the one worth
  // opening, regardless of when it was published.
  return [...groups.values()].sort((a, b) => latest(b).localeCompare(latest(a)))
}

function latest(group: CommentGroup): string {
  return group.comments.reduce((newest, comment) => {
    const at = comment.commentedAt ?? ''
    return at > newest ? at : newest
  }, '')
}

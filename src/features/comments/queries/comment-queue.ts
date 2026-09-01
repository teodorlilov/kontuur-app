import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { createCommentsAdminClient } from '@/features/comments/lib/admin-client'
import { COMMENTED_POST_COLUMNS, type CommentedPostColumns } from '@/lib/queries/select-columns'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { commentStatus, isOurs } from '@/features/comments/lib/comment-status'
import type { CommentGroup, QueuedComment, QueuedCommentReply } from '@/types/api'
import type { IGPostMetricsRow } from '@/types/index'

/** The tag the sync and the moderation actions bust. */
export const IG_COMMENTS_TAG = 'ig-comments'

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

    const admin = createCommentsAdminClient()
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
      .select('client_id, account_id, account_name')
      .eq('platform', 'instagram')
      .in('client_id', clientIds)
    if (connectionError) {
      console.error('[comments] connection query failed:', connectionError.message)
      return EMPTY
    }
    const connections = new Map(
      (
        (connectionData ?? []) as Array<{
          client_id: string | null
          account_id: string
          account_name: string | null
        }>
      ).flatMap((row) => (row.client_id ? [[row.client_id, row] as const] : []))
    )
    // No connected account means nothing to scope comments to, and the withheld
    // count would be meaningless too — there is no Instagram here to withhold them.
    if (connections.size === 0) return EMPTY

    const { data: commentData, error: commentError } = await admin
      .from('ig_comments')
      .select(
        'id, client_id, ig_account_id, ig_media_id, post_id, parent_id, author_username, text, hidden, like_count, commented_at'
      )
      .in('client_id', clientIds)
      .order('commented_at', { ascending: true })
    if (commentError) {
      console.error('[comments] comment query failed:', commentError.message)
      return EMPTY
    }

    /**
     * INVARIANT (20260825/20260826): only rows stamped with the account the client is
     * connected to RIGHT NOW. A client can be repointed at a different Instagram
     * account, and the OAuth callback purges the old account's rows — this filter is
     * the belt to that pair of braces, and it is why the queue cannot show one
     * account's audience under another's name.
     *
     * Filtered here rather than in the query because the condition is a (client,
     * account) pair per client, which PostgREST cannot express as one `in`.
     */
    const rows = ((commentData ?? []) as CommentRow[]).filter(
      (row) => connections.get(row.client_id)?.account_id === row.ig_account_id
    )

    const postIds = [...new Set(rows.flatMap((row) => (row.post_id ? [row.post_id] : [])))]
    const mediaIds = [...new Set(rows.map((row) => row.ig_media_id))]

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
  { revalidate: 30, tags: [IG_COMMENTS_TAG] }
)

export const getCachedCommentQueue = cache(fetchCommentQueue)

/** The stored row, as this read projects it. Hand-written until types regen after 20260837. */
interface CommentRow {
  id: string
  client_id: string
  ig_account_id: string
  ig_media_id: string
  post_id: string | null
  parent_id: string | null
  author_username: string | null
  text: string | null
  hidden: boolean
  like_count: number | null
  commented_at: string | null
}

/**
 * What the nightly metrics sync already knows about a media, reused rather than
 * re-stored.
 *
 * Derived rather than restated: hand-writing these three fields is a mirror of an
 * `ig_post_metrics` row, and `row-mirrors.test.ts` exists because that pattern
 * drifted from its table for three months without anything noticing.
 */
type MediaFacts = Pick<IGPostMetricsRow, 'caption' | 'thumbnail_url' | 'permalink'>

async function fetchPosts(
  admin: SupabaseClient,
  postIds: string[]
): Promise<Map<string, CommentedPostColumns>> {
  if (postIds.length === 0) return new Map()
  const { data, error } = await admin.from('posts').select(COMMENTED_POST_COLUMNS).in('id', postIds)
  if (error) throw new Error(`commented posts query failed: ${error.message}`)
  const rows = (data ?? []) as CommentedPostColumns[]
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * Caption, thumbnail and permalink for media we did NOT publish from Kontuur.
 *
 * The agency may have posted from the Instagram app before connecting, and those
 * posts still collect comments worth answering. `ig_post_metrics` already holds
 * exactly these three facts for every media in the same 30-day window, written by
 * the nightly sync — so the alternative was copying them onto every comment row,
 * which would have meant the same fact stored twice and drifting.
 *
 * Nightly, so a post published in the last few hours may have no row yet. The group
 * simply renders without an image until tonight, which is a smaller cost than a
 * second copy of the media table.
 */
async function fetchMediaFacts(
  admin: SupabaseClient,
  clientIds: string[],
  mediaIds: string[]
): Promise<Map<string, MediaFacts>> {
  if (mediaIds.length === 0) return new Map()
  // Narrow lookup, inline by convention — IG_POST_METRIC_COLUMNS pulls 18 columns
  // for the analytics report and this needs three.
  const { data, error } = await admin
    .from('ig_post_metrics')
    .select('ig_media_id, caption, thumbnail_url, permalink')
    .in('client_id', clientIds)
    .in('ig_media_id', mediaIds)
  if (error) throw new Error(`media facts query failed: ${error.message}`)
  const rows = (data ?? []) as Array<{ ig_media_id: string } & MediaFacts>
  return new Map(rows.map((row) => [row.ig_media_id, row]))
}

/**
 * How many posts have comments we were not given.
 *
 * `ig_post_metrics.comments_count` comes from the media itself, which Instagram
 * reports honestly even under Standard Access — it is the comment BODIES it
 * withholds. So a post with a non-zero count and no stored comment rows is the
 * signature of missing Advanced Access, and it is the one thing that distinguishes
 * that state from a genuinely quiet week.
 */
async function countWithheldPosts(
  admin: SupabaseClient,
  clientIds: string[],
  mediaWithStoredComments: Set<string>
): Promise<number> {
  const { data, error } = await admin
    .from('ig_post_metrics')
    .select('ig_media_id, comments_count')
    .in('client_id', clientIds)
    .gt('comments_count', 0)
  if (error) {
    // A failure here costs an explanation, not the page. Falling back to 0 renders
    // the queue without the banner, which is the same thing a healthy account sees.
    console.error('[comments] withheld count query failed:', error.message)
    return 0
  }
  return ((data ?? []) as Array<{ ig_media_id: string }>).filter(
    (row) => !mediaWithStoredComments.has(row.ig_media_id)
  ).length
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

    const group = groups.get(row.ig_media_id)
    if (group) {
      group.comments.push(comment)
      continue
    }

    const post = row.post_id ? context.posts.get(row.post_id) : undefined
    const facts = context.mediaFacts.get(row.ig_media_id)
    groups.set(row.ig_media_id, {
      igMediaId: row.ig_media_id,
      postId: row.post_id,
      clientId: row.client_id,
      clientName: context.nameByClient.get(row.client_id) ?? 'Unknown client',
      // Our own caption first: it is what the agency wrote and what they will
      // recognise. Instagram's copy is the fallback for posts we did not publish.
      caption: post?.caption ?? facts?.caption ?? null,
      pillar: post?.pillar ?? null,
      publishedAt: post?.published_at ?? null,
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

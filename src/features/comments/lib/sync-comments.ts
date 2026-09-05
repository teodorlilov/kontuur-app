import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { COMMENTABLE_PLATFORMS, resolveComments } from '@/lib/meta/networks'
import type { CommentsAdapter, NetworkAccount, PlatformComment } from '@/lib/meta/networks/types'
import { createSemaphore } from '@/lib/concurrency'
import { fetchPostIdsByMediaId } from '@/lib/queries/posts-by-media-id'
import { upsertPostMetricRows } from '@/features/analytics/lib/post-metrics-store'
import {
  SOCIAL_CONNECTION_SYNC_COLUMNS,
  type SocialConnectionSyncColumns,
} from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * Bringing Instagram's comments into Postgres so the queue can be read without
 * calling Instagram.
 *
 * The shape of this file is copied from `syncAllClientMetrics`, and copied on
 * purpose — that shape encodes constraints this run has too. Sequential across
 * clients rather than parallel, a wall-clock budget checked between clients, and
 * a hard stop on the first rate-limit answer, because Meta's quota is per-app and
 * one 429 poisons every remaining call in the run.
 *
 * What is NOT copied is the cost. The metrics cron fetches everything nightly.
 * This one runs every 30 minutes and can afford to because of one trick: the
 * media list already reports `comments_count`, so a client's whole roster of
 * posts costs ONE call, and only the posts whose count disagrees with what we
 * stored are fetched. A quiet half hour costs one call per client.
 */

/** How far back a post can be and still have its comments watched. */
const MEDIA_LOOKBACK_DAYS = 30

/** How long a stored comment survives. Other people's data, kept only while actionable. */
const RETENTION_DAYS = 90

/**
 * Bounded like every other Graph fan-out here (`fetchManyMediaInsights`,
 * `refreshWindowMetrics`, the visuals cron). Three is the house number.
 */
const COMMENT_FETCH_CONCURRENCY = 3

/** A guard against one runaway post consuming the whole run. 50 comments per page. */
const MAX_PAGES_PER_MEDIA = 10

type IGConnection = SocialConnectionSyncColumns & {
  account_id: string
  access_token: string
}

/**
 * A row on its way in, as the generated schema defines it.
 *
 * Derived rather than restated, the same rule `sync-metrics.ts` follows with
 * `PlatformPostMetricsInsert`: a hand-written copy of a table's columns is what
 * `row-mirrors.test.ts` exists to catch, because that shape drifted from its table
 * for three months without anything noticing.
 */
type CommentRow = Database['public']['Tables']['platform_comments']['Insert']

export interface CommentsSyncOutcome {
  /** Clients whose comments were brought up to date. */
  synced: number
  /** Clients not reached — time budget spent, or the run stopped on a rate limit. */
  skipped: number
  failed: number
  /** Posts whose stored count already matched, so no comment call was made. */
  unchanged: number
  /** Posts that were actually fetched. */
  fetched: number
  errors: Array<{ clientId: string; error: string }>
}

/**
 * Syncs comments for every client with a live Instagram connection.
 *
 * Per-client failures are contained the same way the metrics cron contains them,
 * with one deliberate difference: this run does not notify. A comment sync that
 * fails is not a fact the agency can act on, and the metrics cron already alerts
 * on the conditions they share — a dead token, a revoked permission.
 */
export async function syncAllClientComments(
  admin: SupabaseClient,
  { timeBudgetMs }: { timeBudgetMs: number }
): Promise<CommentsSyncOutcome> {
  const startedAt = Date.now()
  const outcome: CommentsSyncOutcome = {
    synced: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
    fetched: 0,
    errors: [],
  }

  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_SYNC_COLUMNS)
    /**
     * Every network with a comments adapter, derived from the registry rather than listed here.
     *
     * This read `platform = 'instagram'` while the post list came from Instagram's media edge —
     * widening it then would have handed a Page token to that edge. The list is the adapter's
     * now, so the filter is the registry's.
     */
    .in('platform', COMMENTABLE_PLATFORMS)
    .not('access_token', 'is', null)
    .not('account_id', 'is', null)
  if (error) throw new Error(`connection roster query failed: ${error.message}`)
  // WHY as: the shared SupabaseClient param is untyped, so the projection does not infer.
  const connections = (data ?? []) as IGConnection[]

  for (const [index, connection] of connections.entries()) {
    // Between clients, not inside one: a client's comments either come whole or not at all.
    if (Date.now() - startedAt > timeBudgetMs) {
      outcome.skipped += connections.length - index
      break
    }
    const { client_id: clientId } = connection
    if (!clientId) {
      outcome.failed++
      outcome.errors.push({ clientId: connection.account_id, error: 'connection has no client_id' })
      continue
    }
    try {
      const result = await syncClientComments(admin, {
        clientId,
        platform: connection.platform,
        accountId: connection.account_id,
        accessToken: connection.access_token,
      })
      outcome.synced++
      outcome.unchanged += result.unchanged
      outcome.fetched += result.fetched
    } catch (err) {
      outcome.failed++
      const message = err instanceof Error ? err.message : 'unknown error'
      outcome.errors.push({ clientId, error: message })
      // One rate-limit answer poisons every remaining call in this run. Unlike the
      // nightly metrics sync there is nothing to wait for — the next run is in 30
      // minutes, so this costs at most one cycle of freshness.
      if (err instanceof GraphApiError && err.failure === 'rate_limited') {
        outcome.skipped += connections.length - index - 1
        break
      }
    }
  }

  await sweepExpiredComments(admin)
  return outcome
}

/**
 * One client's comments.
 *
 * Exported for the manual-run path and for tests; the cron only calls the sweep
 * above it.
 */
export async function syncClientComments(
  admin: SupabaseClient,
  {
    clientId,
    platform,
    accountId,
    accessToken,
  }: { clientId: string; platform: string; accountId: string; accessToken: string }
): Promise<{ unchanged: number; fetched: number }> {
  /**
   * The network reads and moderates its own comments; everything below — which posts to check,
   * what changed, what to store — is this function's.
   *
   * A platform with no comments adapter has nothing to sync, which is the same answer as a
   * client with no connection: nothing, quietly.
   */
  const adapter = resolveComments(platform)
  if (!adapter) return { unchanged: 0, fetched: 0 }
  const account: NetworkAccount = { accountId, accessToken }

  const sinceIso = new Date(Date.now() - MEDIA_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
  const posts = await adapter.listCommentablePosts({ account, since: sinceIso })
  if (posts.length === 0) return { unchanged: 0, fetched: 0 }

  const commented = posts.filter((post) => post.commentCount > 0)
  if (commented.length === 0) return { unchanged: 0, fetched: 0 }

  const storedCounts = await countStoredByMedia(
    admin,
    clientId,
    accountId,
    commented.map((post) => post.externalPostId)
  )

  /**
   * Fetch only what changed.
   *
   * The comparison is deliberately crude, and it is safe in the direction that
   * matters. If Instagram's `comments_count` excludes replies, a post we have
   * replied to will disagree forever and be refetched every run — wasted calls,
   * bounded to posts already handled. It can never MISS a new comment: anything
   * new raises the count, and a raised count never matches.
   *
   * There is no stored "count we last saw". `platform_post_metrics.comments_count`
   * exists but is a nightly analytics measurement with a different owner and
   * cadence; counting our own rows is the same fact for free and adds no second
   * source of truth to keep in step.
   */
  const stale = commented.filter(
    (post) => post.commentCount !== storedCounts.get(post.externalPostId)
  )

  const postIdByMediaId = await fetchPostIdsByMediaId(
    admin,
    clientId,
    commented.map((post) => post.externalPostId)
  )

  /**
   * Record what each commented media IS, not just what was said under it.
   *
   * The queue renders the post a comment sits under, and it reads that from
   * `platform_post_metrics` — which only the NIGHTLY analytics sync wrote. So a post
   * commented on this morning appeared as an untitled grey box until 03:30 the next
   * day, and a post never published from Kontuur showed as nothing at all forever,
   * which is most of them: on a live account, 18 of 20 media had no Kontuur post.
   *
   * These fields cost nothing to record. `MEDIA_FIELDS` already returns them on the
   * same call this uses for the count comparison, and the alternative — a second
   * table holding caption/permalink/thumbnail per media — would have been the same
   * fact stored twice, in two jobs, drifting.
   *
   * Identity columns ONLY. Reach, views and the rest belong to the nightly job; a
   * zero written here would be indistinguishable from a measured zero on the
   * analytics page.
   *
   * Ahead of the early return below, because a post whose comments have not changed
   * still needs its caption the first time we see it.
   */
  const identified = commented.flatMap((post) =>
    post.identity ? [{ post, identity: post.identity }] : []
  )
  // Only what the network gave an identity for. `platform_post_metrics` is Instagram's own table —
  // keyed on `ig_media_id`/`ig_account_id` and swept by Instagram-scoped deletes — so an
  // adapter with no home for its post identities returns none rather than filing them here.
  if (identified.length > 0) {
    await upsertPostMetricRows(
      admin,
      identified.map(({ post, identity }) => ({
        client_id: clientId,
        platform: adapter.platform,
        platform_account_id: accountId,
        external_post_id: post.externalPostId,
        post_id: postIdByMediaId.get(post.externalPostId) ?? null,
        caption: identity.caption,
        permalink: identity.permalink,
        thumbnail_url: identity.thumbnailUrl,
        media_type: identity.mediaType,
        media_product_type: identity.mediaProductType,
        posted_at: identity.postedAt,
      })),
      'comment media identity'
    )
  }

  if (stale.length === 0) return { unchanged: commented.length, fetched: 0 }

  const semaphore = createSemaphore(COMMENT_FETCH_CONCURRENCY)
  const perMedia = await Promise.all(
    stale.map(async (item) => {
      const release = await semaphore.acquire()
      try {
        const comments = await fetchAllComments(
          adapter,
          account,
          item.externalPostId,
          item.commentCount
        )
        return { mediaId: item.externalPostId, comments }
      } finally {
        release()
      }
    })
  )

  const now = new Date().toISOString()
  const rows: CommentRow[] = []
  for (const { mediaId, comments } of perMedia) {
    for (const comment of comments) {
      rows.push(
        // Replies arrive already flattened, each carrying the comment it answers — how a
        // network delivers them is the adapter's business, and the two do it differently.
        toRow(comment, {
          platform: adapter.platform,
          clientId,
          accountId,
          mediaId,
          postId: postIdByMediaId.get(mediaId) ?? null,
          syncedAt: now,
        })
      )
    }
  }

  await upsertComments(admin, rows)
  await deleteVanished(
    admin,
    clientId,
    accountId,
    stale.map((post) => post.externalPostId),
    new Set(rows.map((row) => row.id))
  )

  return { unchanged: commented.length - stale.length, fetched: stale.length }
}

/**
 * Every page of one media's comments.
 *
 * `fetchMediaComments` returns a single page and a cursor — it does not paginate
 * itself, which is easy to miss and the reason a naive caller silently caps a
 * busy post at 50 comments.
 */
async function fetchAllComments(
  adapter: CommentsAdapter,
  account: NetworkAccount,
  externalPostId: string,
  expectedCount: number
): Promise<PlatformComment[]> {
  const all: PlatformComment[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES_PER_MEDIA; page++) {
    const result = await adapter.fetchComments({
      account,
      externalPostId,
      expectedCount,
      after: cursor,
    })
    all.push(...result.comments)
    // `withheld` is not an error and not an empty post: the app lacks Advanced
    // Access, so Instagram answered 200 with nothing. Stopping here stores zero
    // rows, and the surface reads the same silence and explains it.
    if (result.withheld || !result.nextCursor) break
    cursor = result.nextCursor
  }
  return all
}

function toRow(
  comment: PlatformComment,
  context: {
    platform: string
    clientId: string
    accountId: string
    mediaId: string
    postId: string | null
    syncedAt: string
  }
): CommentRow {
  return {
    id: comment.id,
    client_id: context.clientId,
    platform: context.platform,
    platform_account_id: context.accountId,
    external_post_id: context.mediaId,
    post_id: context.postId,
    parent_id: comment.parentId,
    // Null rather than absent when the network withheld it: Instagram returns the id alone
    // without Advanced Access, and null is the honest record of that.
    author_username: comment.authorName,
    text: comment.text,
    hidden: comment.hidden,
    like_count: comment.likeCount,
    commented_at: comment.commentedAt,
    synced_at: context.syncedAt,
  }
}

/** How many comments we already hold per media, for the change comparison. */
async function countStoredByMedia(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  mediaIds: string[]
): Promise<Map<string, number>> {
  if (mediaIds.length === 0) return new Map()

  const { data, error } = await admin
    .from('platform_comments')
    .select('external_post_id')
    .eq('client_id', clientId)
    .eq('platform_account_id', accountId)
    .in('external_post_id', mediaIds)
  if (error) throw new Error(`platform_comments count query failed: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ external_post_id: string }>) {
    counts.set(row.external_post_id, (counts.get(row.external_post_id) ?? 0) + 1)
  }
  return counts
}

async function upsertComments(admin: SupabaseClient, rows: CommentRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('platform_comments').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`platform_comments upsert failed: ${error.message}`)
}

/**
 * Comments that were there last time and are not now — deleted by their author or
 * by the account, upstream.
 *
 * Scoped to the media we just refetched. A blanket "delete what is not in this
 * batch" would wipe every post the run skipped as unchanged.
 */
async function deleteVanished(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  mediaIds: string[],
  keep: Set<string>
): Promise<void> {
  if (mediaIds.length === 0) return

  const { data, error } = await admin
    .from('platform_comments')
    .select('id')
    .eq('client_id', clientId)
    .eq('platform_account_id', accountId)
    .in('external_post_id', mediaIds)
  if (error) throw new Error(`platform_comments stale query failed: ${error.message}`)

  const gone = ((data ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => !keep.has(id))
  if (gone.length === 0) return

  const { error: deleteError } = await admin.from('platform_comments').delete().in('id', gone)
  if (deleteError) throw new Error(`platform_comments delete failed: ${deleteError.message}`)
}

/**
 * Retention. These rows are other people's personal data and we keep them only
 * while the queue can still act on them.
 *
 * Runs once per sync rather than per client: it is a single statement, and there
 * is no reason to issue it six times. Keyed on when the comment was written, not
 * when we synced it — a row we refresh nightly is not thereby fresh.
 */
async function sweepExpiredComments(admin: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY).toISOString()
  const { error } = await admin.from('platform_comments').delete().lt('commented_at', cutoff)
  if (error) throw new Error(`platform_comments retention sweep failed: ${error.message}`)
}

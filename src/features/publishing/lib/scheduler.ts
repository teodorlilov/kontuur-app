import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import 'server-only'

import { GraphApiError } from '@/lib/meta/graph-errors'
import { resolveNetwork } from '@/lib/meta/networks'
import type { NetworkAccount, NetworkAdapter } from '@/lib/meta/networks/types'
import {
  failPublication,
  PUBLISHABLE_POST_COLUMNS,
  publishOnePublication,
  type PublishablePost,
} from './publish-post'
import { MAX_ATTEMPTS, type Publication } from './publication-store'
import { PUBLICATION_COLUMNS } from '@/lib/queries/select-columns'
import type { PublicationStatus } from '@/lib/posts/publish-state'
import { fetchConnection } from '@/features/publishing/lib/connection'
import { MS_PER_DAY } from '@/utils/constants'

/** How far back a due post is still worth publishing. Older posts are marked failed so they surface. */
const PUBLISH_WINDOW_MS = MS_PER_DAY
/**
 * A claim this old belongs to a killed run — safe to reclaim. Measured from
 * publish_claimed_at, never from the slot: a run lives at most 300s
 * (maxDuration), so a 30-minute-old claim is provably dead, while slot-based
 * staleness would let an overlapping tick reclaim a post another run is
 * actively publishing and double-post it to Instagram. A reclaimed post that
 * carries ig_creation_id resumes its existing container rather than creating
 * a second one.
 */
const STALE_CLAIM_MS = 30 * 60 * 1000
/**
 * Minimum gap between attempts. A failed attempt returns to 'scheduled', and
 * without spacing the every-5-min cron would burn all MAX_ATTEMPTS inside 15
 * minutes — shorter than a routine IG Graph incident or rate-limit window.
 */
const RETRY_SPACING_MS = 30 * 60 * 1000
/**
 * How long a fresh claim keeps its container to itself. A manual publish defers
 * its polling past the response (route budget ~40s); once this grace has passed
 * the deferred worker is provably gone and the cron may resume the container —
 * resume never re-creates, so the worst case is a quick status check, not a
 * duplicate.
 */
const RESUME_GRACE_MS = 90 * 1000
/**
 * Per-run batch cap and time budget. The budget mirrors the generate cron's:
 * the route allows 300s, the loop stops starting new posts at 240s so an
 * in-flight publish can finish inside the allowance. Leftovers roll to the
 * next 5-minute tick.
 */
const BATCH_LIMIT = 25
const TIME_BUDGET_MS = 240_000

/**
 * A due destination with the content it carries. `scheduled_at` rides on the post because
 * when something is due to go out is a property of the content, not of any one network.
 */
type DuePublication = Publication & { posts: PublishablePost & { scheduled_at: string } }

interface PublishSchedulerResult {
  processed: number
  published: number
  failed: number
  /** Accepted but not live yet — their references resume next tick. */
  pending: number
  /**
   * Publishes that reached the network but whose status write was lost. The row still
   * reads 'publishing', so the stale-claim reclaim would resume it — with the reference
   * persisted that resume reconciles instead of reposting, but these still deserve eyes.
   */
  unreconciled: Array<{ publicationId: string; externalPostId: string | null }>
  /** Lost status writes on destinations that did not publish; they retry normally. */
  writeErrors: string[]
}

/** Find and publish every destination that is due. */
export async function publishDuePosts(): Promise<PublishSchedulerResult> {
  const admin = createAdminSupabaseClient()
  const startedAt = Date.now()
  const now = new Date()
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS).toISOString()
  const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()

  /**
   * Destinations that missed the window entirely (cron outage, repeated timeouts), failed
   * one at a time through the same function every other failure goes through.
   *
   * This was a bulk update over `posts` — the same columns markFailed writes, with none of
   * what it does: no retried write, so a lost update left a post stranded in 'scheduled'
   * with nothing reporting it, and no notification, so the agency learned about it by
   * looking at the calendar.
   *
   * `final: true` is deliberate and preserves today's outcome. The due query below requires
   * the post's `scheduled_at >= windowStart` and these are older, so returning one to
   * 'scheduled' could never republish it — it would be swept again next tick, burning an
   * attempt each time until the cap. The window has passed; the attempt did not fail.
   */
  const { data: stranded, error: sweepError } = await admin
    .from('post_publications')
    .select('id, publish_attempts, posts!inner(client_id, scheduled_at)')
    .in('status', ['scheduled', 'publishing'] satisfies readonly PublicationStatus[])
    .lt('posts.scheduled_at', windowStart)
  if (sweepError) throw new Error(`missed-window sweep failed: ${sweepError.message}`)

  /**
   * Derived, not restated. Spelling the attempt column out in a local type reads as a WRITE
   * to cron-invariants.test.ts, which separates writers from mentions by looking for the
   * column name followed by a colon beside a `.from('post_publications')` — so a
   * hand-written annotation here would register as a second writer of a column whose whole
   * point is that it has exactly one.
   *
   * WHY as: the joined posts shape does not infer through the shared client.
   */
  const missed = (stranded ?? []) as unknown as Array<
    Pick<Publication, 'id' | 'publish_attempts'> & { posts: { client_id: string } }
  >
  for (const publication of missed) {
    const { writeError } = await failPublication(
      admin,
      publication.id,
      publication.posts.client_id,
      'Missed publish window',
      { final: true, attempts: publication.publish_attempts }
    )
    if (writeError) console.error(`[publish] ${writeError}`)
  }

  const retrySpacingCutoff = new Date(now.getTime() - RETRY_SPACING_MS).toISOString()
  const resumeGraceCutoff = new Date(now.getTime() - RESUME_GRACE_MS).toISOString()

  /**
   * Due destinations (never attempted, or last attempt long enough ago), plus 'publishing'
   * ones whose claim is stale enough that their run must have died. Oldest first, so the
   * limit cannot starve the head of the queue.
   *
   * The window and the ordering come from the POST — when it was due to go out is a
   * property of the content, not of any one destination — while every claim and attempt
   * condition is the publication's own.
   */
  const { data: rows, error: dueError } = await admin
    .from('post_publications')
    .select(`${PUBLICATION_COLUMNS}, posts!inner(${PUBLISHABLE_POST_COLUMNS}, scheduled_at)`)
    .lte('posts.scheduled_at', now.toISOString())
    .gte('posts.scheduled_at', windowStart)
    .lt('publish_attempts', MAX_ATTEMPTS)
    .or(
      [
        `and(status.eq.scheduled,or(publish_claimed_at.is.null,publish_claimed_at.lt.${retrySpacingCutoff}))`,
        // A parked reference (deferred manual publish whose worker died, or a phase-A
        // timeout) resumes fast — resuming an accepted reference is duplicate-safe and
        // charges no attempt.
        `and(status.eq.publishing,publish_ref.not.is.null,publish_claimed_at.lt.${resumeGraceCutoff})`,
        `and(status.eq.publishing,publish_claimed_at.lt.${staleClaimCutoff})`,
        /**
         * Backfilled rows that arrived 'publishing' with no claim stamp (20260838 carried
         * `posts.publish_claimed_at` across as it found it, nulls included).
         *
         * Every arm here names a column of THIS table. The arm used to end
         * `posts.scheduled_at.lt.${staleClaimCutoff}` — a staleness proxy for a row with no
         * claim to age — and an embedded resource's column cannot appear inside a logic
         * tree: PostgREST rejects the whole thing with "failed to parse logic tree", which
         * would have failed this query on every tick and published nothing at all. It read
         * as a parent column until this query was re-rooted from `posts` onto
         * `post_publications`.
         *
         * Dropping the proxy rather than replacing it, because there is nothing left to wait
         * for: `claimPublication` stamps `publish_claimed_at` in the same statement that sets
         * 'publishing', so a null claim cannot belong to a live run. The top-level
         * `posts.scheduled_at` bounds still apply — those are real filters, ANDed, and legal.
         */
        `and(status.eq.publishing,publish_claimed_at.is.null)`,
      ].join(',')
    )
    /**
     * Oldest due post first, so a backlog longer than BATCH_LIMIT drains from its head
     * instead of starving it.
     *
     * `posts(scheduled_at)` is PostgREST's syntax for sorting the TOP LEVEL by a column of a
     * to-one embed, which `post_publications → posts` is. This was
     * `{ referencedTable: 'posts' }`, which emits `posts.order=scheduled_at` — that sorts the
     * rows INSIDE the embed, and a to-one embed holds exactly one row, so it did nothing at
     * all. The limit then took an arbitrary 25.
     */
    // WHY as: the column argument is typed against this table's own columns, and this names
    // the embedded relation on purpose.
    .order('posts(scheduled_at)' as 'scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)
  if (dueError) throw new Error(`due-publications query failed: ${dueError.message}`)

  // WHY as: the joined posts/post_images shape does not infer through the shared client.
  const due = (rows as unknown as DuePublication[]) ?? []

  const result: PublishSchedulerResult = {
    processed: 0,
    published: 0,
    failed: 0,
    pending: 0,
    unreconciled: [],
    writeErrors: [],
  }

  /**
   * Grouped by (client, platform), not by client alone: the connection differs per network,
   * so one client publishing to two networks needs two credential reads and two quota
   * checks — and mixing them would send a Facebook post with an Instagram token.
   */
  for (const [key, group] of groupByClientAndPlatform(due)) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break

    const { clientId, platform } = key
    const adapter = resolveNetwork(platform)
    const connection = await fetchConnection(admin, clientId, platform)

    // One quota read per client per network per run: publishing into an exhausted quota
    // burns attempts on guaranteed rejections. Rows stay 'scheduled' and are naturally
    // retried once the window frees up.
    const token = connection?.access_token
    if (
      adapter &&
      connection &&
      token &&
      (await isQuotaExhausted(
        adapter,
        { accountId: connection.account_id, accessToken: token },
        result
      ))
    )
      continue

    for (const publication of group) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
      const outcome = await publishOnePublication(admin, publication, publication.posts, connection)
      if (outcome.kind === 'not_claimed') continue
      result.processed++
      if (outcome.kind === 'published') {
        result.published++
        if (outcome.writeError) {
          result.unreconciled.push({
            publicationId: publication.id,
            externalPostId: outcome.externalPostId,
          })
          result.writeErrors.push(outcome.writeError)
        }
      } else if (outcome.kind === 'pending') {
        result.pending++
      } else {
        result.failed++
        if (outcome.writeError) result.writeErrors.push(outcome.writeError)
      }
    }
  }

  return result
}

/**
 * True when the account has no publish quota left; the reason lands in writeErrors for the
 * log.
 *
 * A network without `quotaRemaining` does not meter publishes, so there is nothing to
 * exhaust. Absent must not read as zero — that would defer every post forever.
 */
async function isQuotaExhausted(
  adapter: NetworkAdapter,
  account: NetworkAccount,
  result: PublishSchedulerResult
): Promise<boolean> {
  if (!adapter.quotaRemaining) return false
  try {
    const remaining = await adapter.quotaRemaining(account)
    if (remaining > 0) return false
    result.writeErrors.push(
      `account ${account.accountId} has exhausted its 24h publishing quota — posts deferred`
    )
    return true
  } catch (err) {
    // A failed quota read must not block publishing — the publish call itself will report
    // the real problem with a classified error.
    if (!(err instanceof GraphApiError)) throw err
    return false
  }
}

function groupByClientAndPlatform(
  publications: DuePublication[]
): Map<{ clientId: string; platform: string }, DuePublication[]> {
  const byKey = new Map<
    string,
    { key: { clientId: string; platform: string }; rows: DuePublication[] }
  >()
  for (const publication of publications) {
    const clientId = publication.posts.client_id
    const composite = `${clientId}::${publication.platform}`
    const entry = byKey.get(composite) ?? {
      key: { clientId, platform: publication.platform },
      rows: [],
    }
    entry.rows.push(publication)
    byKey.set(composite, entry)
  }
  return new Map([...byKey.values()].map((entry) => [entry.key, entry.rows]))
}

import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { PostStatus } from '@/lib/validation'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { resolveNetwork } from '@/lib/meta/networks'
import type { NetworkAccount, NetworkAdapter } from '@/lib/meta/networks/types'
import {
  markFailed,
  MAX_ATTEMPTS,
  PUBLISHABLE_POST_COLUMNS,
  publishOnePost,
  type PublishablePost,
} from './publish-post'
import type { InstagramConnection } from './types'
import type { PostRow } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SOCIAL_CONNECTION_AUTH_COLUMNS } from '@/lib/queries/select-columns'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * The scheduler is still single-network: it reads one connection per client and
 * quota-checks that one account, so the platform is named once here rather than
 * spelled into both the query and the adapter lookup.
 *
 * Step 2 of the Facebook arc groups by (client, platform) and this goes with it —
 * a client with two connections needs both, and a due publication knows its own.
 */
const SCHEDULER_NETWORK = 'instagram'

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

type DuePost = PublishablePost & { scheduled_at: string }

interface PublishSchedulerResult {
  processed: number
  published: number
  failed: number
  /** Containers still processing at Meta — their posts resume next tick. */
  pending: number
  /**
   * Publishes that reached Instagram but whose status write was lost. The row
   * still reads 'publishing', so the stale-claim reclaim would resume it —
   * with ig_creation_id persisted that resume reconciles instead of reposting,
   * but these still deserve eyes.
   */
  unreconciled: Array<{ postId: string; mediaId: string | null }>
  /** Lost status writes on posts that did not publish; they retry normally. */
  writeErrors: string[]
}

/** Find and publish all posts that are due for scheduling. */
export async function publishDuePosts(): Promise<PublishSchedulerResult> {
  const admin = createAdminSupabaseClient()
  const startedAt = Date.now()
  const now = new Date()
  const windowStart = new Date(now.getTime() - PUBLISH_WINDOW_MS).toISOString()
  const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()

  /**
   * Posts that missed the window entirely (cron outage, repeated timeouts), failed one at a time
   * through the same function every other failure goes through.
   *
   * This was a bulk `.update({status:'failed', publish_error:'Missed publish window'})` — the same
   * three columns markFailed writes, with none of what it does: no retried write, so a lost update
   * left the post stranded in 'scheduled' with nothing reporting it, and no notification, so the
   * agency learned about it by looking at the calendar.
   *
   * `final: true` is deliberate and preserves today's outcome. The due query below requires
   * `scheduled_at >= windowStart` and these rows are older than that, so returning one to
   * 'scheduled' could never republish it — it would be swept again next tick, burning an attempt
   * each time until the cap. The window has passed; the attempt did not fail.
   *
   * Sequential because the sweep normally finds nothing: it only has volume after an outage, and
   * the notification's cooldown collapses that to one message per client anyway.
   */
  const { data: stranded, error: sweepError } = await admin
    .from('posts')
    .select('id, client_id, publish_attempts')
    .in('status', ['scheduled', 'publishing'] satisfies readonly PostStatus[])
    .lt('scheduled_at', windowStart)
  if (sweepError) throw new Error(`missed-window sweep failed: ${sweepError.message}`)

  // Derived, not restated. Spelling the attempt column out in a local type reads as a WRITE to
  // cron-invariants.test.ts, which separates writers from mentions by looking for the column name
  // followed by a colon beside a `.from('posts')` — so a hand-written annotation here would have
  // registered as the third writer of a column whose whole point is that it has exactly two.
  const missed = (stranded ?? []) as Array<Pick<PostRow, 'id' | 'client_id' | 'publish_attempts'>>
  for (const post of missed) {
    const { writeError } = await markFailed(admin, post, 'Missed publish window', {
      final: true,
      attempts: post.publish_attempts,
    })
    if (writeError) console.error(`[publish] ${writeError}`)
  }

  const retrySpacingCutoff = new Date(now.getTime() - RETRY_SPACING_MS).toISOString()
  const resumeGraceCutoff = new Date(now.getTime() - RESUME_GRACE_MS).toISOString()

  // Due posts (never attempted, or last attempt long enough ago), plus
  // 'publishing' posts whose claim is stale enough that their run must have
  // died. Oldest first, so the limit cannot starve the head of the queue.
  const { data: posts, error: dueError } = await admin
    .from('posts')
    .select(PUBLISHABLE_POST_COLUMNS)
    .lte('scheduled_at', now.toISOString())
    .gte('scheduled_at', windowStart)
    .lt('publish_attempts', MAX_ATTEMPTS)
    .or(
      [
        `and(status.eq.scheduled,or(publish_claimed_at.is.null,publish_claimed_at.lt.${retrySpacingCutoff}))`,
        // A parked container (deferred manual publish whose worker died, or a
        // phase-A timeout) resumes fast — polling an existing container is
        // duplicate-safe and charges no attempt.
        `and(status.eq.publishing,ig_creation_id.not.is.null,publish_claimed_at.lt.${resumeGraceCutoff})`,
        `and(status.eq.publishing,publish_claimed_at.lt.${staleClaimCutoff})`,
        // Rows claimed before publish_claimed_at existed — slot-based staleness, one-time fallback.
        `and(status.eq.publishing,publish_claimed_at.is.null,scheduled_at.lt.${staleClaimCutoff})`,
      ].join(',')
    )
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (dueError) throw new Error(`due-posts query failed: ${dueError.message}`)

  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  const duePosts = (posts as unknown as DuePost[]) ?? []

  const result: PublishSchedulerResult = {
    processed: 0,
    published: 0,
    failed: 0,
    pending: 0,
    unreconciled: [],
    writeErrors: [],
  }

  for (const [clientId, clientPosts] of groupByClientId(duePosts)) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break

    const connection = await fetchInstagramConnection(admin, clientId)

    // One quota read per client per run: publishing into an exhausted quota
    // burns attempts on guaranteed rejections. Posts stay 'scheduled' and are
    // naturally retried once the rolling 24h window frees up.
    const token = connection?.access_token
    const adapter = resolveNetwork(SCHEDULER_NETWORK)
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

    for (const post of clientPosts) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
      const outcome = await publishOnePost(admin, post, connection)
      if (outcome.kind === 'not_claimed') continue
      result.processed++
      if (outcome.kind === 'published') {
        result.published++
        if (outcome.writeError) {
          result.unreconciled.push({ postId: post.id, mediaId: outcome.mediaId })
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
 * True when the account has no publish quota left; the reason lands in writeErrors
 * for the log.
 *
 * A network without `quotaRemaining` does not meter publishes, so there is nothing
 * to exhaust. Absent must not read as zero — that would defer every post forever.
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
    // A failed quota read must not block publishing — the publish call itself
    // will report the real problem with a classified error.
    if (!(err instanceof GraphApiError)) throw err
    return false
  }
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

async function fetchInstagramConnection(
  admin: SupabaseClient,
  clientId: string
): Promise<InstagramConnection | null> {
  // maybeSingle: a client with no Instagram connection is an expected state that
  // publishOnePost reports per post, not a query failure worth aborting the run.
  const { data, error } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', clientId)
    .eq('platform', SCHEDULER_NETWORK)
    .maybeSingle()
  if (error) throw new Error(`connection lookup failed for client ${clientId}: ${error.message}`)
  // Supabase select returns the exact fields we project; narrow to InstagramConnection
  return data as InstagramConnection | null
}

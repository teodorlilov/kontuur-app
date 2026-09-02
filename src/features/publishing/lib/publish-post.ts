import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostImageRow, PostRow } from '@/types'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { resolveNetwork } from '@/lib/meta/networks'
import type { NetworkAdapter, NetworkPublishResult, PostPayload } from '@/lib/meta/networks/types'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { notify } from '@/lib/notifications/notify'
import type { InstagramConnection } from './types'

/**
 * The one publish implementation — the every-5-minute cron and the manual
 * "Publish now" route both run a post through here, so the claim, the retry
 * ladder and the state transitions cannot disagree.
 *
 * It knows nothing about any particular network. A network is resolved from the
 * post's platform and asked to publish; what comes back is `published`, `pending`
 * or `rejected`, and this file decides what each means for the row. That split is
 * deliberate and load-bearing: every database write lives here, so no network can
 * write the same columns from a second place.
 *
 * `pending` is the reason the flow has two phases. A network may accept content
 * before it is live — Instagram creates a container that can outlive the request
 * — so the reference it hands back is persisted BEFORE anything waits on it. If
 * this run dies past that line, the next tick resumes the SAME reference instead
 * of publishing a second copy.
 */

export const MAX_ATTEMPTS = 3

type PublishableImage = Pick<PostImageRow, 'public_url' | 'position' | 'content_type'>

/** The projection both entry points read. Kept in one string so they cannot drift. */
export const PUBLISHABLE_POST_COLUMNS =
  'id, caption, post_type, platform, status, scheduled_at, publish_attempts, publish_claimed_at, ig_creation_id, client_id, post_images(public_url, position, content_type)'

export type PublishablePost = Pick<
  PostRow,
  | 'id'
  | 'caption'
  | 'post_type'
  | 'platform'
  | 'status'
  | 'scheduled_at'
  | 'publish_attempts'
  | 'publish_claimed_at'
  | 'ig_creation_id'
  | 'client_id'
> & {
  post_images: PublishableImage[]
}

export type PublishOutcome =
  | { kind: 'published'; mediaId: string | null; writeError?: string }
  | { kind: 'failed'; error: string; final: boolean; writeError?: string }
  /** Container still processing — the row stays 'publishing' and the next tick resumes it. */
  | { kind: 'pending'; creationId: string }
  /** Another run holds the claim; nothing was done here. */
  | { kind: 'not_claimed' }

interface PublishStatusPatch {
  status?: string
  ig_media_id?: string | null
  ig_creation_id?: string | null
  ig_account_id?: string | null
  published_at?: string
  publish_error?: string | null
  publish_attempts?: number
}

/**
 * Apply a publish-status patch, retrying once before giving up. Supabase returns
 * write errors instead of throwing, and a lost write after a successful publish
 * is what turns a stale claim into a duplicate post.
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

/**
 * Atomically claim a post (compare-and-swap), stamping publish_claimed_at so
 * overlapping runs and the stale-claim reclaim can tell a live claim from a
 * dead one.
 *
 * Two modes with different accounting: a FRESH claim (no container yet) charges
 * an attempt, because it is one. A RESUME claim (ig_creation_id present) only
 * re-stamps the claim — polling an existing container is not a new attempt, and
 * charging it would let a slow container burn the whole budget and fail-final a
 * post whose media was still processing normally.
 */
async function claimPost(
  admin: SupabaseClient,
  post: PublishablePost
): Promise<{ claimed: boolean; attempts: number }> {
  if (post.ig_creation_id) {
    let query = admin
      .from('posts')
      .update({ status: 'publishing', publish_claimed_at: new Date().toISOString() })
      .eq('id', post.id)
      .eq('status', post.status)
      .eq('ig_creation_id', post.ig_creation_id)
    query =
      post.publish_claimed_at === null
        ? query.is('publish_claimed_at', null)
        : query.eq('publish_claimed_at', post.publish_claimed_at)
    const { data, error } = await query.select('id')
    if (error) throw new Error(`resume claim failed for post ${post.id}: ${error.message}`)
    return { claimed: !!data && data.length > 0, attempts: post.publish_attempts }
  }

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
  // post every tick. Propagate so the run reports it.
  if (error) throw new Error(`claim failed for post ${post.id}: ${error.message}`)
  return { claimed: !!data && data.length > 0, attempts: post.publish_attempts + 1 }
}

async function markPublished(
  admin: SupabaseClient,
  postId: string,
  mediaId: string | null,
  accountId: string
): Promise<string | null> {
  const error = await patchPost(admin, postId, {
    status: 'published',
    ig_media_id: mediaId,
    ig_creation_id: null,
    // The target account, recorded at the only moment it is knowable — the
    // analytics union pins only posts stamped with the current connection.
    ig_account_id: accountId,
    published_at: new Date().toISOString(),
    publish_error: null,
  })
  if (error === null) return null
  return `post ${postId} published as media ${mediaId ?? 'unknown'} but the status write was lost: ${error}`
}

/**
 * A post could not be published — the ONE way `status: 'failed'` and its two companions are
 * written, whatever went wrong.
 *
 * The scheduler's missed-window sweep used to write the same three columns itself, in a bulk
 * update. Same meaning, different behaviour: it skipped `patchPost`, so a lost write left a post
 * reading `scheduled` forever with nothing reporting it, and it never notified — a post that failed
 * an attempt reached the agency, a post that missed its window did not.
 *
 * Takes only the two fields it reads rather than a whole `PublishablePost`: the sweep has a light
 * row, and a narrower contract is what let it call this at all.
 */
export async function markFailed(
  admin: SupabaseClient,
  post: { id: string; client_id: string },
  message: string,
  options: { final: boolean; attempts: number; clearCreationId?: boolean; network?: string }
): Promise<{ final: boolean; writeError: string | null }> {
  const attempts = options.attempts
  const final = options.final || attempts >= MAX_ATTEMPTS
  const writeError = await patchPost(admin, post.id, {
    status: final ? 'failed' : 'scheduled',
    publish_error: message,
    publish_attempts: attempts,
    ...(options.clearCreationId ? { ig_creation_id: null } : {}),
  })
  if (final) {
    // The durable record is publish_error on the row; the notification is how a
    // failure reaches someone who is not looking at the calendar.
    //
    // `network` is absent for the missed-window sweep, which fails a post no
    // network ever saw — naming one there would invent a culprit.
    const subject = options.network ? `A scheduled ${options.network} post` : 'A scheduled post'
    await notify(admin, {
      clientId: post.client_id,
      message: `${subject} could not be published: ${message}`,
    }).catch((err) => {
      console.error(`[publish] failure notification for post ${post.id} not sent:`, err)
    })
  }
  return {
    final,
    writeError: writeError ? `post ${post.id} failure write was lost: ${writeError}` : null,
  }
}

/**
 * Map a Graph failure to what the retry ladder should do with it.
 *
 * The classification is Meta's, shared by every network on its Graph; only the
 * name in the message differs, which is what `label` is for.
 */
function graphFailureToDecision(
  err: GraphApiError,
  label: string
): { message: string; final: boolean } {
  switch (err.failure) {
    case 'token_invalid':
      return {
        message: `${label} connection is no longer valid — reconnect the account`,
        final: false,
      }
    case 'permission':
      return { message: `${label} permission error: ${err.message}`, final: true }
    case 'media_invalid':
      return { message: `${label} rejected the media: ${err.message}`, final: true }
    case 'rate_limited':
      return { message: `${label} rate limit reached — will retry`, final: false }
    default:
      return { message: err.message, final: false }
  }
}

/** The row as a network sees it: the content, and nothing about our bookkeeping. */
function toPayload(post: PublishablePost): PostPayload {
  return {
    caption: post.caption ?? '',
    media: post.post_images.map((img) => ({
      publicUrl: img.public_url,
      position: img.position,
      contentType: img.content_type,
    })),
  }
}

/**
 * Credential problems, which read the same on every network and so are not an
 * adapter's business. A network only judges the content.
 */
function connectionBlocker(
  connection: InstagramConnection | null,
  label: string
): { message: string; final: boolean } | null {
  if (!connection) return { message: `No ${label} account connected`, final: false }
  if (!connection.access_token)
    return { message: `${label} connection needs reconnecting`, final: false }
  if (isTokenExpired(connection.token_expires_at))
    return { message: `${label} token expired`, final: false }
  return null
}

/**
 * Turn what the network said into rows and an outcome. The ONE place a publish
 * result reaches the database.
 *
 * `pending` writes nothing here: the reference was persisted before the wait that
 * produced it, which is the whole point of persisting it first.
 */
async function applyResult(
  admin: SupabaseClient,
  post: PublishablePost,
  adapter: NetworkAdapter,
  accountId: string,
  result: NetworkPublishResult,
  attempts: number
): Promise<PublishOutcome> {
  if (result.kind === 'published') {
    const writeError = await markPublished(admin, post.id, result.externalPostId, accountId)
    return {
      kind: 'published',
      mediaId: result.externalPostId,
      writeError: writeError ?? undefined,
    }
  }

  if (result.kind === 'pending') return { kind: 'pending', creationId: result.publishRef }

  // Rejected: whatever reference it held is dead, so clear it and let the ladder
  // start the next attempt clean.
  const { final, writeError } = await markFailed(admin, post, result.reason, {
    final: false,
    attempts,
    clearCreationId: true,
    network: adapter.label,
  })
  return { kind: 'failed', error: result.reason, final, writeError: writeError ?? undefined }
}

/** When the current attempt took its claim — what a network needs to reconcile a lost id. */
function claimedAtMs(post: PublishablePost): number | null {
  return post.publish_claimed_at ? new Date(post.publish_claimed_at).getTime() : null
}

/**
 * Claim and publish one post. Callers pass the row as read; every state
 * transition happens in here.
 */
export async function publishOnePost(
  admin: SupabaseClient,
  post: PublishablePost,
  connection: InstagramConnection | null,
  options: { skipPoll?: boolean } = {}
): Promise<PublishOutcome> {
  // Runs before the claim — a post bound for a network we cannot publish to must
  // never consume an attempt or reach the wrong account. Resolution is
  // case-insensitive because rows canonically store 'Instagram' (20260809) while
  // connections store 'instagram'.
  const adapter = resolveNetwork(post.platform)
  if (!adapter) {
    const message = `Publishing to ${post.platform} is not supported yet`
    const { writeError } = await markFailed(admin, post, message, {
      final: true,
      attempts: post.publish_attempts + 1,
    })
    return { kind: 'failed', error: message, final: true, writeError: writeError ?? undefined }
  }

  const claim = await claimPost(admin, post)
  if (!claim.claimed) return { kind: 'not_claimed' }

  const payload = toPayload(post)
  const blocker = connectionBlocker(connection, adapter.label) ?? adapter.preflight(payload)
  const accessToken = connection?.access_token ?? null
  if (blocker || !connection || !accessToken) {
    const message = blocker?.message ?? 'Unknown error'
    const { final, writeError } = await markFailed(admin, post, message, {
      final: blocker?.final ?? false,
      attempts: claim.attempts,
      network: adapter.label,
    })
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }

  const account = { accountId: connection.account_id, accessToken }

  try {
    if (post.ig_creation_id) {
      const resumed = await adapter.resume({
        account,
        publishRef: post.ig_creation_id,
        claimedAt: claimedAtMs(post),
      })
      return await applyResult(admin, post, adapter, account.accountId, resumed, claim.attempts)
    }

    const started = await adapter.publish({ account, payload })

    // A network that publishes in one call is already done; there is nothing to
    // persist and nothing to wait for.
    if (started.kind !== 'pending') {
      return await applyResult(admin, post, adapter, account.accountId, started, claim.attempts)
    }

    // Persisted before the first wait: if this run dies past this line, the next
    // tick resumes this reference instead of publishing a duplicate.
    const writeError = await patchPost(admin, post.id, { ig_creation_id: started.publishRef })
    if (writeError) {
      console.error(
        `[publish] post ${post.id}: ${adapter.label} accepted ${started.publishRef} but the id write was lost`
      )
    }

    // Deferred mode: the reference exists and is persisted, which is all the
    // caller needs before responding — the wait continues out of band.
    if (options.skipPoll) return { kind: 'pending', creationId: started.publishRef }

    const finished = await adapter.resume({
      account,
      publishRef: started.publishRef,
      claimedAt: claimedAtMs(post),
    })
    return await applyResult(
      admin,
      { ...post, ig_creation_id: started.publishRef },
      adapter,
      account.accountId,
      finished,
      claim.attempts
    )
  } catch (err) {
    if (err instanceof GraphApiError) {
      const decision = graphFailureToDecision(err, adapter.label)
      const { final, writeError } = await markFailed(admin, post, decision.message, {
        final: decision.final,
        attempts: claim.attempts,
        clearCreationId: decision.final,
        network: adapter.label,
      })
      return { kind: 'failed', error: decision.message, final, writeError: writeError ?? undefined }
    }
    const message = err instanceof Error ? err.message : 'Unknown publish error'
    const { final, writeError } = await markFailed(admin, post, message, {
      final: false,
      attempts: claim.attempts,
      network: adapter.label,
    })
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }
}

/**
 * Finish a deferred publish after the response has gone out. The caller's
 * request already holds the claim it took seconds ago, so this does NOT
 * re-claim — the scheduler's resume arm waits out a grace period before it may
 * touch the row, which is what keeps the two from resuming the same reference.
 */
export async function resumePendingPublish(
  admin: SupabaseClient,
  postId: string,
  pollBudgetMs: number
): Promise<void> {
  const { data } = await admin
    .from('posts')
    .select(PUBLISHABLE_POST_COLUMNS)
    .eq('id', postId)
    .maybeSingle()
  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  const post = data as unknown as PublishablePost | null
  if (!post || post.status !== 'publishing' || !post.ig_creation_id) return

  const adapter = resolveNetwork(post.platform)
  if (!adapter) return

  const { data: connData } = await admin
    .from('social_connections')
    .select('account_id, access_token, token_expires_at')
    .eq('client_id', post.client_id)
    .eq('platform', adapter.platform)
    .maybeSingle()
  // Supabase select returns the exact fields we project; narrow to InstagramConnection
  const connection = connData as InstagramConnection | null
  if (!connection?.access_token) return

  try {
    const result = await adapter.resume({
      account: { accountId: connection.account_id, accessToken: connection.access_token },
      publishRef: post.ig_creation_id,
      claimedAt: claimedAtMs(post),
      pollBudgetMs,
    })
    await applyResult(admin, post, adapter, connection.account_id, result, post.publish_attempts)
  } catch (err) {
    if (err instanceof GraphApiError) {
      const decision = graphFailureToDecision(err, adapter.label)
      await markFailed(admin, post, decision.message, {
        final: decision.final,
        attempts: post.publish_attempts,
        clearCreationId: decision.final,
        network: adapter.label,
      })
      return
    }
    // Anything else: leave the row in 'publishing' — the scheduler's resume arm
    // picks it up after the grace period.
    console.error(`[publish] deferred finish for post ${postId} failed:`, err)
  }
}

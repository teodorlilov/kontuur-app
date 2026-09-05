import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostImageRow, PostRow } from '@/types'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { resolveNetwork } from '@/lib/meta/networks'
import { fetchConnection } from '@/features/publishing/lib/connection'
import { PUBLICATION_COLUMNS } from '@/lib/queries/select-columns'
import type { NetworkAdapter, NetworkPublishResult, PostPayload } from '@/lib/meta/networks/types'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { notify } from '@/lib/notifications/notify'
import {
  claimPublication,
  markPublicationFailed,
  markPublicationPublished,
  setPublishRef,
  type Publication,
} from './publication-store'
import type { InstagramConnection } from './types'

/**
 * The one publish implementation — the every-5-minute cron and the manual "Publish now"
 * route both run a destination through here, so the claim, the retry ladder and the state
 * transitions cannot disagree.
 *
 * It publishes a PUBLICATION, not a post. A post is content; a publication is that content
 * on one network, with its own lock, its own retry budget and its own reference. Two
 * destinations on one post are two independent runs through this function, and one failing
 * says nothing about the other.
 *
 * It knows nothing about any particular network. A network is resolved from the
 * publication's platform and asked to publish; back comes `published`, `pending` or
 * `rejected`, and this file decides what each means. Every database write goes through
 * `publication-store`, so no network can write the same columns from a second place.
 *
 * `pending` is why the flow has two phases. A network may accept content before it is live
 * — Instagram creates a container that can outlive the request — so the reference it hands
 * back is persisted BEFORE anything waits on it. If this run dies past that line, the next
 * tick resumes the SAME reference instead of publishing a second copy.
 */

type PublishableImage = Pick<PostImageRow, 'public_url' | 'position' | 'content_type'>

/**
 * The content a publish attempt needs. Everything about the ATTEMPT — status, attempts,
 * claim, references — lives on the publication now, which is why none of it is here.
 */
export const PUBLISHABLE_POST_COLUMNS =
  'id, caption, post_type, client_id, post_images(public_url, position, content_type)'

export type PublishablePost = Pick<PostRow, 'id' | 'caption' | 'post_type' | 'client_id'> & {
  post_images: PublishableImage[]
}

export type PublishOutcome =
  | { kind: 'published'; externalPostId: string | null; writeError?: string }
  | { kind: 'failed'; error: string; final: boolean; writeError?: string }
  /** Accepted but not live — the row keeps its reference and the next tick resumes it. */
  | { kind: 'pending'; publishRef: string }
  /** Another run holds the claim; nothing was done here. */
  | { kind: 'not_claimed' }

/**
 * Fail a destination and, when it is final, tell someone.
 *
 * The store writes; this decides whether a human hears about it. That split is why the
 * notification is here and not there — a store that notified would fire for every caller
 * including ones that already reported the failure themselves.
 *
 * `network` is absent for the missed-window sweep, which fails a destination no network
 * ever saw; naming one there would invent a culprit.
 */
export async function failPublication(
  admin: SupabaseClient,
  publicationId: string,
  clientId: string,
  message: string,
  options: { final: boolean; attempts: number; clearRef?: boolean; network?: string }
): Promise<{ final: boolean; writeError: string | null }> {
  const result = await markPublicationFailed(admin, publicationId, message, options)
  if (result.final) {
    // The durable record is publish_error on the row; the notification is how a failure
    // reaches someone who is not looking at the calendar.
    const subject = options.network ? `A scheduled ${options.network} post` : 'A scheduled post'
    await notify(admin, {
      clientId,
      message: `${subject} could not be published: ${message}`,
    }).catch((err) => {
      console.error(
        `[publish] failure notification for publication ${publicationId} not sent:`,
        err
      )
    })
  }
  return result
}

/**
 * Map a Graph failure to what the retry ladder should do with it.
 *
 * The classification is Meta's, shared by every network on its Graph; only the name in the
 * message differs, which is what `label` is for.
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
 * Credential problems, which read the same on every network and so are not an adapter's
 * business. A network only judges the content.
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
 * Turn what the network said into rows and an outcome.
 *
 * `pending` writes nothing here: the reference was persisted before the wait that produced
 * it, which is the whole point of persisting it first.
 */
async function applyResult(
  admin: SupabaseClient,
  publication: Publication,
  post: PublishablePost,
  adapter: NetworkAdapter,
  accountId: string,
  result: NetworkPublishResult,
  attempts: number
): Promise<PublishOutcome> {
  if (result.kind === 'published') {
    const writeError = await markPublicationPublished(
      admin,
      publication.id,
      result.externalPostId,
      accountId
    )
    return {
      kind: 'published',
      externalPostId: result.externalPostId,
      writeError: writeError ?? undefined,
    }
  }

  if (result.kind === 'pending') return { kind: 'pending', publishRef: result.publishRef }

  // Rejected: whatever reference it held is dead, so clear it and let the ladder start the
  // next attempt clean.
  const { final, writeError } = await failPublication(
    admin,
    publication.id,
    post.client_id,
    result.reason,
    { final: false, attempts, clearRef: true, network: adapter.label }
  )
  return { kind: 'failed', error: result.reason, final, writeError: writeError ?? undefined }
}

/** When this attempt took its claim — what a network needs to reconcile a lost id. */
function claimedAtMs(publication: Publication): number | null {
  return publication.publish_claimed_at ? new Date(publication.publish_claimed_at).getTime() : null
}

/**
 * Claim and publish one destination. Callers pass the rows as read; every state transition
 * happens in here.
 */
export async function publishOnePublication(
  admin: SupabaseClient,
  publication: Publication,
  post: PublishablePost,
  connection: InstagramConnection | null,
  options: { skipPoll?: boolean } = {}
): Promise<PublishOutcome> {
  // Runs before the claim — a destination we cannot publish to must never consume an
  // attempt or reach the wrong account.
  const adapter = resolveNetwork(publication.platform)
  if (!adapter) {
    const message = `Publishing to ${publication.platform} is not supported yet`
    const { writeError } = await failPublication(admin, publication.id, post.client_id, message, {
      final: true,
      attempts: publication.publish_attempts + 1,
    })
    return { kind: 'failed', error: message, final: true, writeError: writeError ?? undefined }
  }

  const claim = await claimPublication(admin, publication)
  if (!claim.claimed) return { kind: 'not_claimed' }

  const payload = toPayload(post)
  const blocker = connectionBlocker(connection, adapter.label) ?? adapter.preflight(payload)
  const accessToken = connection?.access_token ?? null
  if (blocker || !connection || !accessToken) {
    const message = blocker?.message ?? 'Unknown error'
    const { final, writeError } = await failPublication(
      admin,
      publication.id,
      post.client_id,
      message,
      { final: blocker?.final ?? false, attempts: claim.attempts, network: adapter.label }
    )
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }

  const account = { accountId: connection.account_id, accessToken }

  try {
    if (publication.publish_ref) {
      const resumed = await adapter.resume({
        account,
        publishRef: publication.publish_ref,
        claimedAt: claimedAtMs(publication),
      })
      return await applyResult(
        admin,
        publication,
        post,
        adapter,
        account.accountId,
        resumed,
        claim.attempts
      )
    }

    const started = await adapter.publish({ account, payload })

    // A network that publishes in one call is already done: nothing to persist, nothing to
    // wait for.
    if (started.kind !== 'pending') {
      return await applyResult(
        admin,
        publication,
        post,
        adapter,
        account.accountId,
        started,
        claim.attempts
      )
    }

    // Persisted before the first wait: if this run dies past this line, the next tick
    // resumes this reference instead of publishing a duplicate.
    const writeError = await setPublishRef(admin, publication.id, started.publishRef)
    if (writeError) {
      console.error(
        `[publish] publication ${publication.id}: ${adapter.label} accepted ${started.publishRef} but the reference write was lost`
      )
    }

    // Deferred mode: the reference exists and is persisted, which is all the caller needs
    // before responding — the wait continues out of band.
    if (options.skipPoll) return { kind: 'pending', publishRef: started.publishRef }

    const finished = await adapter.resume({
      account,
      publishRef: started.publishRef,
      claimedAt: claimedAtMs(publication),
    })
    return await applyResult(
      admin,
      { ...publication, publish_ref: started.publishRef },
      post,
      adapter,
      account.accountId,
      finished,
      claim.attempts
    )
  } catch (err) {
    if (err instanceof GraphApiError) {
      const decision = graphFailureToDecision(err, adapter.label)
      const { final, writeError } = await failPublication(
        admin,
        publication.id,
        post.client_id,
        decision.message,
        {
          final: decision.final,
          attempts: claim.attempts,
          clearRef: decision.final,
          network: adapter.label,
        }
      )
      return { kind: 'failed', error: decision.message, final, writeError: writeError ?? undefined }
    }
    const message = err instanceof Error ? err.message : 'Unknown publish error'
    const { final, writeError } = await failPublication(
      admin,
      publication.id,
      post.client_id,
      message,
      { final: false, attempts: claim.attempts, network: adapter.label }
    )
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }
}

/**
 * Finish a deferred publish after the response has gone out.
 *
 * The caller's request already holds the claim it took seconds ago, so this does NOT
 * re-claim — the scheduler's resume arm waits out a grace period before it may touch the
 * row, which is what keeps the two from resuming the same reference.
 */
export async function resumePendingPublication(
  admin: SupabaseClient,
  publicationId: string,
  pollBudgetMs: number
): Promise<void> {
  const { data } = await admin
    .from('post_publications')
    .select(`${PUBLICATION_COLUMNS}, posts!inner(${PUBLISHABLE_POST_COLUMNS})`)
    .eq('id', publicationId)
    .maybeSingle()
  // WHY as: the joined posts/post_images shape does not infer through the shared client.
  const row = data as unknown as (Publication & { posts: PublishablePost }) | null
  if (!row || row.status !== 'publishing' || !row.publish_ref) return

  const adapter = resolveNetwork(row.platform)
  if (!adapter) return

  const connection = await fetchConnection(admin, row.posts.client_id, adapter.platform)
  if (!connection?.access_token) return

  try {
    const result = await adapter.resume({
      account: { accountId: connection.account_id, accessToken: connection.access_token },
      publishRef: row.publish_ref,
      claimedAt: claimedAtMs(row),
      pollBudgetMs,
    })
    await applyResult(
      admin,
      row,
      row.posts,
      adapter,
      connection.account_id,
      result,
      row.publish_attempts
    )
  } catch (err) {
    if (err instanceof GraphApiError) {
      const decision = graphFailureToDecision(err, adapter.label)
      await failPublication(admin, row.id, row.posts.client_id, decision.message, {
        final: decision.final,
        attempts: row.publish_attempts,
        clearRef: decision.final,
        network: adapter.label,
      })
      return
    }
    // Anything else: leave the row in 'publishing' — the scheduler's resume arm picks it
    // up after the grace period.
    console.error(`[publish] deferred finish for publication ${publicationId} failed:`, err)
  }
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLICATION_COLUMNS, type PublicationColumns } from '@/lib/queries/select-columns'
import type { PublicationStatus } from '@/lib/posts/publish-state'

/**
 * Where a post went — the ONE way `post_publications` is written.
 *
 * The same reasoning as `account-metrics-store`: a table with several writers spread
 * across files has nothing keeping their conflict targets, their status vocabulary and
 * their claim conditions in agreement. Here it matters more than usual, because one of
 * these operations is a lock. `claimPublication` is an optimistic compare-and-swap, and it
 * is the only thing standing between two racing runs and a duplicate post; a second
 * implementation of it somewhere else would not fail loudly, it would double-post.
 *
 * Every function takes the untyped admin client, matching the metrics stores — the
 * projection does not infer through a shared `SupabaseClient` parameter, which is why the
 * casts below are marked rather than avoided.
 */

/** How many attempts a destination gets before it is failed for good. */
export const MAX_ATTEMPTS = 3

/**
 * A destination as the publish path reads it.
 *
 * The columns come from `PublicationColumns`, so the projection and its type are one list in
 * select-columns.ts. Only the narrowing lives here: `status` is free text in the column and a
 * four-value lifecycle in the code, and every branch below depends on that.
 */
export type Publication = Omit<PublicationColumns, 'status'> & { status: PublicationStatus }

/**
 * Record where a post is going, one row per destination.
 *
 * Idempotent on (post_id, platform): rescheduling a post that already has a destination
 * must not create a second row for it, and must not reset an attempt counter that a
 * previous run earned.
 */
export async function createPublications(
  admin: SupabaseClient,
  postId: string,
  platforms: readonly string[]
): Promise<Publication[]> {
  if (platforms.length === 0) return []
  const wanted = platforms.map((platform) => platform.toLowerCase())

  const { error } = await admin.from('post_publications').upsert(
    wanted.map((platform) => ({
      post_id: postId,
      platform,
      status: 'scheduled' satisfies PublicationStatus,
    })),
    // ignoreDuplicates, then read back — NOT a plain upsert. Writing over an existing row
    // would reset a status and an attempt counter a previous run earned, so rescheduling a
    // post that already published would quietly queue it to publish a second time.
    { onConflict: 'post_id,platform', ignoreDuplicates: true }
  )
  if (error) throw new Error(`publication create failed for post ${postId}: ${error.message}`)

  const { data, error: readError } = await admin
    .from('post_publications')
    .select(PUBLICATION_COLUMNS)
    .eq('post_id', postId)
    .in('platform', wanted)
  if (readError) throw new Error(`publication read failed for post ${postId}: ${readError.message}`)
  // WHY as: the projection does not infer through a shared, untyped SupabaseClient.
  return (data ?? []) as Publication[]
}

/**
 * Take a post's destinations back off the queue when its slot is removed.
 *
 * Only ones that have not gone out: pulling a published post off the calendar must not
 * erase the record that it went out, and a destination mid-flight is already in a network's
 * hands. This is a withdrawal of intent, not of history.
 */
export async function withdrawPendingPublications(
  admin: SupabaseClient,
  postId: string
): Promise<void> {
  const { error } = await admin
    .from('post_publications')
    .delete()
    .eq('post_id', postId)
    .eq('status', 'scheduled' satisfies PublicationStatus)
  if (error) throw new Error(`publication withdraw failed for post ${postId}: ${error.message}`)
}

/**
 * Atomically take a publication for an attempt, stamping `publish_claimed_at` so
 * overlapping runs and the stale-claim reclaim can tell a live claim from a dead one.
 *
 * Two modes with different accounting, carried over from the post-level claim this
 * replaces. A FRESH claim charges an attempt, because it is one. A RESUME claim — one that
 * already holds a `publish_ref` — only re-stamps: waiting on a reference the network
 * already accepted is not a new attempt, and charging it would let a slow container burn
 * the whole budget and fail a post whose media was processing normally.
 */
export async function claimPublication(
  admin: SupabaseClient,
  publication: Publication
): Promise<{ claimed: boolean; attempts: number }> {
  const now = new Date().toISOString()

  if (publication.publish_ref) {
    let query = admin
      .from('post_publications')
      // publish_error is cleared with the claim. It used to survive one, so a destination that
      // bounced and was re-armed still carried the old message while its next attempt was in
      // flight — and the deferred-publish watcher, which reports any destination carrying an
      // error, raised a failure toast ~3s into a publish that was succeeding.
      .update({ status: 'publishing', publish_claimed_at: now, publish_error: null })
      .eq('id', publication.id)
      .eq('status', publication.status)
      .eq('publish_ref', publication.publish_ref)
    query =
      publication.publish_claimed_at === null
        ? query.is('publish_claimed_at', null)
        : query.eq('publish_claimed_at', publication.publish_claimed_at)
    const { data, error } = await query.select('id')
    if (error)
      throw new Error(`resume claim failed for publication ${publication.id}: ${error.message}`)
    return { claimed: !!data && data.length > 0, attempts: publication.publish_attempts }
  }

  const { data, error } = await admin
    .from('post_publications')
    .update({
      status: 'publishing',
      publish_attempts: publication.publish_attempts + 1,
      publish_claimed_at: now,
      // See the resume claim above: a fresh attempt starts with no failure to report.
      publish_error: null,
    })
    .eq('id', publication.id)
    .eq('status', publication.status)
    .eq('publish_attempts', publication.publish_attempts)
    .select('id')
  // A database error is not a lost race: treating it as one would silently skip the
  // publication every tick. Propagate so the run reports it.
  if (error) throw new Error(`claim failed for publication ${publication.id}: ${error.message}`)
  return { claimed: !!data && data.length > 0, attempts: publication.publish_attempts + 1 }
}

/**
 * Persist the reference a network handed back before anything waits on it.
 *
 * This write is what makes a dying run safe: the next tick resumes this reference instead
 * of publishing a second copy.
 */
export async function setPublishRef(
  admin: SupabaseClient,
  publicationId: string,
  publishRef: string
): Promise<string | null> {
  return patch(admin, publicationId, { publish_ref: publishRef })
}

/** A destination went live. */
export async function markPublicationPublished(
  admin: SupabaseClient,
  publicationId: string,
  externalPostId: string | null,
  accountId: string
): Promise<string | null> {
  const error = await patch(admin, publicationId, {
    status: 'published',
    external_post_id: externalPostId,
    publish_ref: null,
    // The account it actually landed on, recorded at the only moment it is knowable — the
    // analytics union pins only rows stamped with the current connection.
    account_id: accountId,
    published_at: new Date().toISOString(),
    publish_error: null,
  })
  if (error === null) return null
  return `publication ${publicationId} published as ${externalPostId ?? 'unknown'} but the status write was lost: ${error}`
}

/**
 * A destination could not publish — the ONE way `status: 'failed'` and its companions are
 * written, whatever went wrong.
 *
 * `final` means no retry can help. Otherwise the row returns to `scheduled` and the ladder
 * gives it another go, up to MAX_ATTEMPTS.
 */
export async function markPublicationFailed(
  admin: SupabaseClient,
  publicationId: string,
  message: string,
  options: { final: boolean; attempts: number; clearRef?: boolean }
): Promise<{ final: boolean; writeError: string | null }> {
  const final = options.final || options.attempts >= MAX_ATTEMPTS
  const writeError = await patch(admin, publicationId, {
    status: final ? 'failed' : 'scheduled',
    publish_error: message,
    publish_attempts: options.attempts,
    ...(options.clearRef ? { publish_ref: null } : {}),
  })
  return {
    final,
    writeError: writeError
      ? `publication ${publicationId} failure write was lost: ${writeError}`
      : null,
  }
}

/**
 * Put a failed destination back in the queue — the user's decision, not the ladder's.
 *
 * The ONLY place attempts are reset, which is what stops a re-arm from silently competing
 * with the retry budget the ladder is enforcing.
 */
export async function rearmPublication(
  admin: SupabaseClient,
  publicationId: string
): Promise<{ rearmed: boolean; error: string | null }> {
  const { data, error } = await admin
    .from('post_publications')
    .update({
      status: 'scheduled' satisfies PublicationStatus,
      publish_attempts: 0,
      publish_error: null,
      // The scheduler treats a claim as a lease. Leaving a dead one behind would make the
      // row look claimed until it went stale on its own.
      publish_claimed_at: null,
      /**
       * `publish_ref` is deliberately NOT cleared — the post-level re-arm this replaces kept
       * its `ig_creation_id` for the same reason. A reference the network already accepted is
       * what makes a retry duplicate-safe: the scheduler's resume arm polls it and can discover
       * the media went out after all. Nulling it forces a fresh container, which publishes the
       * post a SECOND time. `markPublicationFailed` already clears the ref through `clearRef`
       * on the failures where it is genuinely dead.
       */
    })
    .eq('id', publicationId)
    // Guarded on it still being failed: two people re-arming the same destination, or a
    // re-arm racing the cron's own retry, must not resurrect one that has since published.
    .eq('status', 'failed' satisfies PublicationStatus)
    .select('id')
  if (error) return { rearmed: false, error: error.message }
  // Zero rows means the guard rejected it, not that the write was lost.
  return { rearmed: !!data && data.length > 0, error: null }
}

/** The writable half of a publication, derived for the same reason `Publication` is. */
type PublicationPatch = Partial<Omit<Publication, 'id' | 'post_id' | 'platform'>>

/**
 * Apply a patch, retrying once before giving up. Supabase returns write errors instead of
 * throwing, and a lost write after a successful publish is what turns a stale claim into a
 * duplicate post.
 */
async function patch(
  admin: SupabaseClient,
  publicationId: string,
  values: PublicationPatch
): Promise<string | null> {
  const { error } = await admin.from('post_publications').update(values).eq('id', publicationId)
  if (!error) return null
  const retry = await admin.from('post_publications').update(values).eq('id', publicationId)
  return retry.error?.message ?? null
}

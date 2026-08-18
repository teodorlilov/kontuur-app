import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostRow } from '@/types'
import { createSemaphore } from '@/lib/concurrency'
import { GraphApiError } from '@/lib/meta/graph-errors'
import {
  createCarouselContainer,
  createImageContainer,
  getContainerStatus,
  publishContainer,
  fetchRecentMedia,
} from '@/lib/meta/publishing'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { altTextFromCaption, validateInstagramCaption } from './validate-caption'
import { insertClientNotificationOnce } from './notifications'
import type { InstagramConnection } from './types'

/**
 * The one publish implementation — the every-5-minute cron and the manual
 * "Publish now" route both run a post through here, so the claim, the platform
 * guard, the retry ladder and the two-phase container flow cannot disagree.
 *
 * Two phases because a container can outlive a request: phase A creates the
 * container and persists its id BEFORE polling, so if this run dies or times
 * out, the next tick enters phase B and polls the SAME container instead of
 * creating a second one — which is how slow containers used to become
 * duplicate Instagram posts.
 */

export const MAX_ATTEMPTS = 3

/** Phase-A poll budget. Containers usually finish in seconds; slower ones roll to the next tick. */
const CONTAINER_POLL_BUDGET_MS = 18_000
const CONTAINER_POLL_INTERVAL_MS = 3_000
/** Carousel children are created concurrently, but politely. */
const CHILD_CONTAINER_CONCURRENCY = 3

interface PublishableImage {
  public_url: string
  position: number
  content_type: string | null
}

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
 * Atomically claim a post (compare-and-swap on status + attempt count), stamping
 * publish_claimed_at so overlapping runs and the stale-claim reclaim can tell a
 * live claim from a dead one.
 */
async function claimPost(admin: SupabaseClient, post: PublishablePost): Promise<boolean> {
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
  return !!data && data.length > 0
}

async function markPublished(
  admin: SupabaseClient,
  postId: string,
  mediaId: string | null
): Promise<string | null> {
  const error = await patchPost(admin, postId, {
    status: 'published',
    ig_media_id: mediaId,
    ig_creation_id: null,
    published_at: new Date().toISOString(),
    publish_error: null,
  })
  if (error === null) return null
  return `post ${postId} published as media ${mediaId ?? 'unknown'} but the status write was lost: ${error}`
}

async function markFailed(
  admin: SupabaseClient,
  post: PublishablePost,
  message: string,
  options: { final: boolean; clearCreationId?: boolean }
): Promise<{ final: boolean; writeError: string | null }> {
  const attempts = post.publish_attempts + 1
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
    await insertClientNotificationOnce(
      admin,
      post.client_id,
      `A scheduled Instagram post could not be published: ${message}`
    ).catch((err) => {
      console.error(`[publish] failure notification for post ${post.id} not sent:`, err)
    })
  }
  return {
    final,
    writeError: writeError ? `post ${post.id} failure write was lost: ${writeError}` : null,
  }
}

/** Map a Graph failure to what the retry ladder should do with it. */
function graphFailureToDecision(err: GraphApiError): { message: string; final: boolean } {
  switch (err.failure) {
    case 'token_invalid':
      return {
        message: 'Instagram connection is no longer valid — reconnect the account',
        final: false,
      }
    case 'permission':
      return { message: `Instagram permission error: ${err.message}`, final: true }
    case 'media_invalid':
      return { message: `Instagram rejected the media: ${err.message}`, final: true }
    case 'rate_limited':
      return { message: 'Instagram rate limit reached — will retry', final: false }
    default:
      return { message: err.message, final: false }
  }
}

/** Poll a container within this run's budget. Times out as IN_PROGRESS, never as failure. */
async function pollContainer(
  creationId: string,
  accessToken: string
): Promise<'FINISHED' | 'IN_PROGRESS' | 'ERROR' | 'EXPIRED' | 'PUBLISHED'> {
  const deadline = Date.now() + CONTAINER_POLL_BUDGET_MS
  for (;;) {
    const status = await getContainerStatus(creationId, accessToken)
    if (status !== 'IN_PROGRESS') return status
    if (Date.now() + CONTAINER_POLL_INTERVAL_MS > deadline) return 'IN_PROGRESS'
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_INTERVAL_MS))
  }
}

/**
 * A container reporting PUBLISHED has media live on Instagram but no media id
 * in hand. Take the newest media posted since this attempt was claimed — the
 * account publishes through us, so the newest-since-claim item is this post.
 */
async function reconcilePublishedContainer(
  post: PublishablePost,
  accountId: string,
  accessToken: string
): Promise<string | null> {
  const claimedAt = post.publish_claimed_at ? new Date(post.publish_claimed_at).getTime() : 0
  const recent = await fetchRecentMedia(accountId, accessToken)
  const match = recent.find(
    (m) => m.timestamp !== null && new Date(m.timestamp).getTime() >= claimedAt
  )
  return match?.id ?? null
}

/** Resume a post whose container already exists (phase B). */
async function resumeContainer(
  admin: SupabaseClient,
  post: PublishablePost,
  accountId: string,
  accessToken: string,
  creationId: string
): Promise<PublishOutcome> {
  const status = await pollContainer(creationId, accessToken)

  if (status === 'IN_PROGRESS') return { kind: 'pending', creationId }

  if (status === 'FINISHED') {
    const mediaId = await publishContainer(accountId, creationId, accessToken)
    const writeError = await markPublished(admin, post.id, mediaId)
    return { kind: 'published', mediaId, writeError: writeError ?? undefined }
  }

  if (status === 'PUBLISHED') {
    const mediaId = await reconcilePublishedContainer(post, accountId, accessToken)
    const writeError = await markPublished(admin, post.id, mediaId)
    return { kind: 'published', mediaId, writeError: writeError ?? undefined }
  }

  // ERROR / EXPIRED: this container is dead — clear it so the retry starts clean.
  const { final, writeError } = await markFailed(admin, post, `Instagram container ${status}`, {
    final: false,
    clearCreationId: true,
  })
  return {
    kind: 'failed',
    error: `Instagram container ${status}`,
    final,
    writeError: writeError ?? undefined,
  }
}

/** Create the container(s) for a post and persist the creation id (phase A). */
async function createContainers(
  admin: SupabaseClient,
  post: PublishablePost,
  accountId: string,
  accessToken: string,
  imageUrls: string[],
  caption: string
): Promise<string> {
  const altText = altTextFromCaption(caption)
  let creationId: string

  if (imageUrls.length === 1) {
    creationId = await createImageContainer(accountId, accessToken, {
      imageUrl: imageUrls[0]!,
      caption,
      altText,
    })
  } else {
    const semaphore = createSemaphore(CHILD_CONTAINER_CONCURRENCY)
    const childIds = await Promise.all(
      imageUrls.map(async (imageUrl) => {
        const release = await semaphore.acquire()
        try {
          return await createImageContainer(accountId, accessToken, {
            imageUrl,
            altText,
            isCarouselItem: true,
          })
        } finally {
          release()
        }
      })
    )
    creationId = await createCarouselContainer(accountId, accessToken, childIds, caption)
  }

  // Persisted before the first poll: if this run dies past this line, the next
  // tick resumes this container instead of creating a duplicate.
  const writeError = await patchPost(admin, post.id, { ig_creation_id: creationId })
  if (writeError) {
    console.error(
      `[publish] post ${post.id}: container ${creationId} created but the id write was lost`
    )
  }
  return creationId
}

/** Reasons a claimed post cannot publish right now. Final = cannot resolve on its own. */
function preflightBlocker(
  post: PublishablePost,
  connection: InstagramConnection | null,
  caption: string
): { message: string; final: boolean } | null {
  if (!connection) return { message: 'No Instagram account connected', final: false }
  if (!connection.access_token)
    return { message: 'Instagram connection needs reconnecting', final: false }
  if (isTokenExpired(connection.token_expires_at))
    return { message: 'Instagram token expired', final: false }
  if (post.post_images.length === 0) return { message: 'No images attached', final: false }
  if (post.post_images.length > 10)
    return { message: 'Instagram carousels allow at most 10 images', final: true }

  // Instagram accepts JPEG only; a PNG burns every attempt with an opaque error.
  const nonJpeg = post.post_images.find(
    (img) => img.content_type !== null && img.content_type !== 'image/jpeg'
  )
  if (nonJpeg) {
    return {
      message: `Image at position ${nonJpeg.position + 1} is ${nonJpeg.content_type} — Instagram requires JPEG. Re-export or re-upload it.`,
      final: true,
    }
  }

  const captionError = validateInstagramCaption(caption)
  if (captionError) return { message: captionError, final: true }
  return null
}

/**
 * Claim and publish one post. Callers pass the row as read; every state
 * transition happens in here.
 */
export async function publishOnePost(
  admin: SupabaseClient,
  post: PublishablePost,
  connection: InstagramConnection | null
): Promise<PublishOutcome> {
  // Case-insensitive: rows canonically store 'Instagram' (20260809), older
  // writes stored lowercase. Runs before the claim — wrong-platform posts must
  // never consume attempts or reach the wrong account.
  if (post.platform.toLowerCase() !== 'instagram') {
    const { writeError } = await markFailed(
      admin,
      post,
      `Publishing to ${post.platform} is not supported yet`,
      { final: true }
    )
    return {
      kind: 'failed',
      error: `Publishing to ${post.platform} is not supported yet`,
      final: true,
      writeError: writeError ?? undefined,
    }
  }

  if (!(await claimPost(admin, post))) return { kind: 'not_claimed' }

  const caption = post.caption ?? ''
  const blocker = preflightBlocker(post, connection, caption)
  const accessToken = connection?.access_token ?? null
  if (blocker || !connection || !accessToken) {
    const message = blocker?.message ?? 'Unknown error'
    const { final, writeError } = await markFailed(admin, post, message, {
      final: blocker?.final ?? false,
    })
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }

  try {
    if (post.ig_creation_id) {
      return await resumeContainer(
        admin,
        post,
        connection.account_id,
        accessToken,
        post.ig_creation_id
      )
    }

    const imageUrls = post.post_images
      .sort((a, b) => a.position - b.position)
      .map((img) => img.public_url)

    const creationId = await createContainers(
      admin,
      post,
      connection.account_id,
      accessToken,
      imageUrls,
      caption
    )
    // Reuse phase B for the fresh container: same poll, same publish, same
    // terminal handling — the only difference is who created the container.
    return await resumeContainer(
      admin,
      { ...post, ig_creation_id: creationId },
      connection.account_id,
      accessToken,
      creationId
    )
  } catch (err) {
    if (err instanceof GraphApiError) {
      const decision = graphFailureToDecision(err)
      const { final, writeError } = await markFailed(admin, post, decision.message, {
        final: decision.final,
        clearCreationId: decision.final,
      })
      return { kind: 'failed', error: decision.message, final, writeError: writeError ?? undefined }
    }
    const message = err instanceof Error ? err.message : 'Unknown publish error'
    const { final, writeError } = await markFailed(admin, post, message, { final: false })
    return { kind: 'failed', error: message, final, writeError: writeError ?? undefined }
  }
}

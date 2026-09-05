import 'server-only'

import { createSemaphore } from '@/lib/concurrency'
import { PLATFORM_NAMES } from '@/lib/validation'
import { FB_GRAPH_BASE } from '../constants'
import { graphGet, graphPost } from '../graph-client'
import { fbCreatedObjectSchema, fbPermalinkSchema, fbPublishAckSchema } from '../schemas'
import type {
  NetworkAccount,
  NetworkAdapter,
  NetworkPublishResult,
  PostPayload,
  PreflightBlocker,
  PublishInput,
  ResumeInput,
} from './types'

/**
 * Facebook Pages, as a network.
 *
 * Publishing is two-phase, for the same reason Instagram's is: the post is CREATED before it is
 * made live, and the reference to it is persisted in between. A run that dies after Meta
 * accepted the post resumes THAT post rather than creating a second one.
 *
 * The single-call form — `/feed` publishing outright — was what this adapter did first, and it
 * had no defence against a lost response. Graph's own client retries a timed-out request, and
 * the ladder grants two more attempts on top, so a `/feed` call Meta accepted but did not answer
 * within 15s could put the same post on the Page three times. Nothing about that is theoretical;
 * it is precisely the failure Instagram's two-phase shape exists to prevent.
 *
 * What makes the retry safe is that phase B is IDEMPOTENT: publishing an already-published post
 * answers `{"success":true}` again, creating nothing. Probed, not assumed.
 *
 * ONE PATH FOR ONE PHOTO AND FOR TEN. Facebook also offers a one-request single-photo publish
 * (`/photos` with `published=true` and a `caption`), and taking it would mean two publish
 * bodies, two response shapes and two things to keep correct for one operation. The probe
 * confirmed a one-item `attached_media` behaves identically, so there is nothing to buy.
 *
 * Three things below could not be read from the documentation and were probed against a live
 * Page instead — recorded in `docs/META-FB-PROBE.md`:
 *
 * - `attached_media` takes a JSON array. The docs spell it as indexed form parameters
 *   (`attached_media[0]={…}`) and the shared client sends JSON bodies; the array form works.
 * - **Order is preserved.** Four distinct photos read back through
 *   `attachments{subattachments}` in exactly the order they were attached. A carousel is an
 *   ordered sequence, so this is the fact the format depends on and the docs never state it.
 * - Ten attachments are accepted. No maximum is documented anywhere.
 */

/**
 * The most photos one post may carry.
 *
 * Empirical, not documented — Meta states no limit on `attached_media` and its own community
 * carries the question unanswered, so this is the largest count actually verified against a
 * live Page. It coincides with the most an Instagram carousel holds, which is the most this app
 * ever generates; a post that exceeded it would be refused here rather than failing mid-upload
 * with photos already on the Page.
 */
const MAX_ATTACHED_PHOTOS = 10

/** Uploads run concurrently but politely, as Instagram's carousel children do. */
const UPLOAD_CONCURRENCY = 3

export const facebookAdapter: NetworkAdapter = {
  platform: 'facebook',
  label: PLATFORM_NAMES.facebook,

  /**
   * Both kinds.
   *
   * A carousel becomes a multi-photo post — the same `/feed` call with more attachments, in the
   * order the slides were written, which the probe confirmed Facebook keeps.
   */
  accepts: () => true,

  preflight(payload: PostPayload): PreflightBlocker | null {
    // Not final: images arrive moments after a draft is approved, so an empty set is usually a
    // race rather than a verdict.
    if (payload.media.length === 0) return { message: 'No images attached', final: false }

    // Final: a post does not lose slides on a retry.
    if (payload.media.length > MAX_ATTACHED_PHOTOS) {
      return {
        message: `Facebook posts allow at most ${MAX_ATTACHED_PHOTOS} images`,
        final: true,
      }
    }
    return null
  },

  async publish({ account, payload }: PublishInput): Promise<NetworkPublishResult> {
    const ordered = [...payload.media].sort((a, b) => a.position - b.position)

    /**
     * Uploaded concurrently, attached in slide order.
     *
     * `Promise.all` resolves in argument order however the requests interleave, so the array
     * handed to `/feed` is the order the post is read in — which is the whole of a carousel.
     */
    const semaphore = createSemaphore(UPLOAD_CONCURRENCY)
    const photoIds = await Promise.all(
      ordered.map(async (image) => {
        const release = await semaphore.acquire()
        try {
          return await uploadUnpublishedPhoto(account, image.publicUrl)
        } finally {
          release()
        }
      })
    )

    // Created, not live. The caller persists this id before anything else happens to it.
    return { kind: 'pending', publishRef: await createUnpublishedPost(account, payload, photoIds) }
  },

  /**
   * Make the created post live.
   *
   * Safe to call more than once by design: Meta answers `{"success":true}` for a post that is
   * already published, so a retry after a lost response confirms rather than duplicates. The
   * post id IS the reference, so there is nothing to read back.
   */
  async resume({ account, publishRef }: ResumeInput): Promise<NetworkPublishResult> {
    await graphPost(fbPublishAckSchema, `${FB_GRAPH_BASE}/${publishRef}`, account.accessToken, {
      is_published: true,
    })
    return { kind: 'published', externalPostId: publishRef }
  },

  async permalink(account: NetworkAccount, externalPostId: string): Promise<string | null> {
    const data = await graphGet(
      fbPermalinkSchema,
      `${FB_GRAPH_BASE}/${externalPostId}`,
      account.accessToken,
      { fields: 'permalink_url' }
    )
    return data.permalink_url ?? null
  },

  // `quotaRemaining` is deliberately absent. Instagram meters API publishes per rolling 24h;
  // Facebook Pages do not, and the contract reads an absent method as unmetered rather than
  // as zero.
}

/**
 * Upload one photo without publishing it; returns the id a feed post attaches.
 *
 * An upload the feed call never reaches leaves the photo invisible on the Page — Meta deletes
 * unpublished photos after about 24 hours. A retry uploads afresh rather than reusing an id,
 * which is correct: reusing one across attempts is what would risk a duplicate.
 */
async function uploadUnpublishedPhoto(account: NetworkAccount, imageUrl: string): Promise<string> {
  const data = await graphPost(
    fbCreatedObjectSchema,
    `${FB_GRAPH_BASE}/${account.accountId}/photos`,
    account.accessToken,
    { url: imageUrl, published: false }
  )
  return data.id
}

/**
 * Create the post over already-uploaded photos, WITHOUT publishing it; returns
 * `<page-id>_<post-id>`.
 *
 * `published: false` is what makes this phase safe to retry — a lost response leaves an
 * invisible post, not a second live one, and the next attempt simply makes another.
 *
 * `message` is the caption here. The `/photos` edge deprecated `message` in favour of
 * `caption` and the `/feed` edge did the reverse, so the two calls in this file deliberately
 * name their text differently.
 */
async function createUnpublishedPost(
  account: NetworkAccount,
  payload: PostPayload,
  photoIds: string[]
): Promise<string> {
  const data = await graphPost(
    fbCreatedObjectSchema,
    `${FB_GRAPH_BASE}/${account.accountId}/feed`,
    account.accessToken,
    {
      message: payload.caption,
      attached_media: photoIds.map((mediaFbid) => ({ media_fbid: mediaFbid })),
      published: false,
    }
  )
  return data.id
}

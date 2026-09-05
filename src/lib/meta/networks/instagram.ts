import 'server-only'

import { createSemaphore } from '@/lib/concurrency'
import { PLATFORM_NAMES } from '@/lib/validation'
import { altTextFromCaption, validateInstagramCaption } from './instagram-caption'
import { IG_GRAPH_BASE } from '../constants'
import { graphGet, graphPost } from '../graph-client'
import {
  igContainerResponseSchema,
  igContainerStatusSchema,
  igPublishingLimitSchema,
  igPermalinkSchema,
  igRecentMediaSchema,
} from '../schemas'
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
 * Instagram, as a network.
 *
 * Publishing here is two-phase because a container can outlive a request: the
 * container is created and its id handed back BEFORE anything is polled, so a run
 * that dies mid-flight resumes the SAME container instead of creating a second
 * one. Slow containers becoming duplicate posts is the failure this shape exists
 * to prevent, and it is why `publish` returns `pending` rather than blocking —
 * persisting that reference is the caller's job, and the caller is the only thing
 * allowed to write.
 */

/** Phase-A poll budget. Containers usually finish in seconds; slower ones roll to the next tick. */
const CONTAINER_POLL_BUDGET_MS = 18_000

/**
 * Single images usually finish within a second or two — polling fast at the start
 * is what lets a manual publish confirm quickly; the tail backs off so a slow
 * carousel does not hammer the status endpoint.
 */
const POLL_SCHEDULE_MS = [1_000, 1_000, 2_000, 3_000]

/** Carousel children are created concurrently, but politely. */
const CHILD_CONTAINER_CONCURRENCY = 3

/** Instagram's own ceiling on a carousel. */
const MAX_CAROUSEL_IMAGES = 10

/** Meta's default API-publish allowance per rolling 24h at advanced access. */
const DEFAULT_QUOTA_TOTAL = 100

type ContainerStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export const instagramAdapter: NetworkAdapter = {
  platform: 'instagram',
  label: PLATFORM_NAMES.instagram,

  /** Both: a single image is one container, a carousel is a parent over children. */
  accepts: () => true,

  preflight(payload: PostPayload): PreflightBlocker | null {
    if (payload.media.length === 0) return { message: 'No images attached', final: false }
    if (payload.media.length > MAX_CAROUSEL_IMAGES) {
      return { message: 'Instagram carousels allow at most 10 images', final: true }
    }

    // Instagram accepts JPEG only; a PNG burns every attempt with an opaque error.
    const nonJpeg = payload.media.find(
      (img) => img.contentType !== null && img.contentType !== 'image/jpeg'
    )
    if (nonJpeg) {
      return {
        message: `Image at position ${nonJpeg.position + 1} is ${nonJpeg.contentType} — Instagram requires JPEG. Re-export or re-upload it.`,
        final: true,
      }
    }

    const captionError = validateInstagramCaption(payload.caption)
    if (captionError) return { message: captionError, final: true }
    return null
  },

  async publish({ account, payload }: PublishInput): Promise<NetworkPublishResult> {
    const imageUrls = [...payload.media]
      .sort((a, b) => a.position - b.position)
      .map((img) => img.publicUrl)
    const altText = altTextFromCaption(payload.caption)

    if (imageUrls.length === 1) {
      const publishRef = await createImageContainer(account, {
        imageUrl: imageUrls[0]!,
        caption: payload.caption,
        altText,
      })
      return { kind: 'pending', publishRef }
    }

    const semaphore = createSemaphore(CHILD_CONTAINER_CONCURRENCY)
    const childIds = await Promise.all(
      imageUrls.map(async (imageUrl) => {
        const release = await semaphore.acquire()
        try {
          return await createImageContainer(account, { imageUrl, altText, isCarouselItem: true })
        } finally {
          release()
        }
      })
    )
    return {
      kind: 'pending',
      publishRef: await createCarouselContainer(account, childIds, payload.caption),
    }
  },

  async resume({
    account,
    publishRef,
    claimedAt,
    pollBudgetMs,
  }: ResumeInput): Promise<NetworkPublishResult> {
    const status = await pollContainer(
      publishRef,
      account.accessToken,
      pollBudgetMs ?? CONTAINER_POLL_BUDGET_MS
    )

    // Still processing: the caller keeps the reference and comes back.
    if (status === 'IN_PROGRESS') return { kind: 'pending', publishRef }

    if (status === 'FINISHED') {
      return { kind: 'published', externalPostId: await publishContainer(account, publishRef) }
    }

    /**
     * PUBLISHED means the media is live but the id never came back. Take the
     * newest media posted since this attempt was claimed — the account publishes
     * through us, so the newest-since-claim item is this post.
     */
    if (status === 'PUBLISHED') {
      const recent = await fetchRecentMedia(account)
      const match = recent.find(
        (m) => m.timestamp !== null && new Date(m.timestamp).getTime() >= (claimedAt ?? 0)
      )
      return { kind: 'published', externalPostId: match?.id ?? null }
    }

    // ERROR / EXPIRED: this container is dead, so the reference is worthless.
    return { kind: 'rejected', reason: `Instagram container ${status}` }
  },

  async permalink(account: NetworkAccount, externalPostId: string): Promise<string | null> {
    const data = await graphGet(
      igPermalinkSchema,
      `${IG_GRAPH_BASE}/${externalPostId}`,
      account.accessToken,
      { fields: 'permalink' }
    )
    return data.permalink ?? null
  },

  async quotaRemaining(account: NetworkAccount): Promise<number> {
    const data = await graphGet(
      igPublishingLimitSchema,
      `${IG_GRAPH_BASE}/${account.accountId}/content_publishing_limit`,
      account.accessToken,
      { fields: 'config,quota_usage' }
    )
    const entry = data.data?.[0]
    if (!entry) return DEFAULT_QUOTA_TOTAL
    return Math.max(0, (entry.config?.quota_total ?? DEFAULT_QUOTA_TOTAL) - entry.quota_usage)
  },
}

interface ImageContainerParams {
  imageUrl: string
  caption?: string
  altText?: string
  isCarouselItem?: boolean
}

/** Create a single-image container; returns the creation id. */
async function createImageContainer(
  account: NetworkAccount,
  params: ImageContainerParams
): Promise<string> {
  const body: Record<string, unknown> = { image_url: params.imageUrl }
  if (params.caption !== undefined) body.caption = params.caption
  if (params.altText) body.alt_text = params.altText
  if (params.isCarouselItem) body.is_carousel_item = true
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${account.accountId}/media`,
    account.accessToken,
    body
  )
  return data.id
}

/** Create the parent carousel container over already-created children. */
async function createCarouselContainer(
  account: NetworkAccount,
  childIds: string[],
  caption: string
): Promise<string> {
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${account.accountId}/media`,
    account.accessToken,
    { media_type: 'CAROUSEL', children: childIds.join(','), caption }
  )
  return data.id
}

/** Publish a FINISHED container; returns the live media id. */
async function publishContainer(account: NetworkAccount, creationId: string): Promise<string> {
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${account.accountId}/media_publish`,
    account.accessToken,
    { creation_id: creationId }
  )
  return data.id
}

/** Poll a container within the given budget. Times out as IN_PROGRESS, never as failure. */
async function pollContainer(
  creationId: string,
  accessToken: string,
  budgetMs: number
): Promise<ContainerStatusCode> {
  const deadline = Date.now() + budgetMs
  for (let poll = 0; ; poll++) {
    const status = await getContainerStatus(creationId, accessToken)
    if (status !== 'IN_PROGRESS') return status
    const interval = POLL_SCHEDULE_MS[Math.min(poll, POLL_SCHEDULE_MS.length - 1)]!
    if (Date.now() + interval > deadline) return 'IN_PROGRESS'
    await new Promise((r) => setTimeout(r, interval))
  }
}

/** Read a container's status. Unknown shapes read as IN_PROGRESS — the caller polls again. */
async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<ContainerStatusCode> {
  const data = await graphGet(
    igContainerStatusSchema,
    `${IG_GRAPH_BASE}/${containerId}`,
    accessToken,
    { fields: 'status_code,status' }
  )
  return data.status_code ?? 'IN_PROGRESS'
}

/** Newest media on the account — reconciliation for containers that report PUBLISHED. */
async function fetchRecentMedia(
  account: NetworkAccount,
  limit = 5
): Promise<Array<{ id: string; timestamp: string | null }>> {
  const data = await graphGet(
    igRecentMediaSchema,
    `${IG_GRAPH_BASE}/${account.accountId}/media`,
    account.accessToken,
    { fields: 'id,timestamp', limit: String(limit) }
  )
  return (data.data ?? []).map((m) => ({ id: m.id, timestamp: m.timestamp ?? null }))
}

import 'server-only'

import { IG_GRAPH_BASE } from './constants'
import { graphGet, graphPost } from './graph-client'
import {
  igContainerResponseSchema,
  igContainerStatusSchema,
  igPublishingLimitSchema,
  igRecentMediaSchema,
} from './schemas'

/**
 * Instagram content-publishing Graph calls. Pure I/O: no polling loops, no
 * database, no retry policy beyond the client's own transient handling — the
 * two-phase state machine that decides when to call what lives in
 * features/publishing/lib/publish-post.ts.
 */

type ContainerStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

interface ImageContainerParams {
  imageUrl: string
  caption?: string
  altText?: string
  isCarouselItem?: boolean
}

/** Create a single-image container; returns the creation id. */
export async function createImageContainer(
  igUserId: string,
  accessToken: string,
  params: ImageContainerParams
): Promise<string> {
  const body: Record<string, unknown> = { image_url: params.imageUrl }
  if (params.caption !== undefined) body.caption = params.caption
  if (params.altText) body.alt_text = params.altText
  if (params.isCarouselItem) body.is_carousel_item = true
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${igUserId}/media`,
    accessToken,
    body
  )
  return data.id
}

/** Create the parent carousel container over already-created children. */
export async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  childIds: string[],
  caption: string
): Promise<string> {
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${igUserId}/media`,
    accessToken,
    { media_type: 'CAROUSEL', children: childIds.join(','), caption }
  )
  return data.id
}

/** Read a container's processing status. Unknown shapes read as IN_PROGRESS — the caller polls again. */
export async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<ContainerStatusCode> {
  const data = await graphGet(
    igContainerStatusSchema,
    `${IG_GRAPH_BASE}/${containerId}`,
    accessToken,
    {
      fields: 'status_code,status',
    }
  )
  return data.status_code ?? 'IN_PROGRESS'
}

/** Publish a FINISHED container; returns the live media id. */
export async function publishContainer(
  igUserId: string,
  creationId: string,
  accessToken: string
): Promise<string> {
  const data = await graphPost(
    igContainerResponseSchema,
    `${IG_GRAPH_BASE}/${igUserId}/media_publish`,
    accessToken,
    { creation_id: creationId }
  )
  return data.id
}

/** Meta's default API-publish allowance per rolling 24h at advanced access. */
const DEFAULT_QUOTA_TOTAL = 100

/** How much of the 24h publishing quota the account has left. */
export async function fetchRemainingQuota(igUserId: string, accessToken: string): Promise<number> {
  const data = await graphGet(
    igPublishingLimitSchema,
    `${IG_GRAPH_BASE}/${igUserId}/content_publishing_limit`,
    accessToken,
    { fields: 'config,quota_usage' }
  )
  const entry = data.data?.[0]
  if (!entry) return DEFAULT_QUOTA_TOTAL
  return Math.max(0, (entry.config?.quota_total ?? DEFAULT_QUOTA_TOTAL) - entry.quota_usage)
}

interface RecentMedia {
  id: string
  timestamp: string | null
}

/** Newest media on the account — reconciliation for containers that report PUBLISHED. */
export async function fetchRecentMedia(
  igUserId: string,
  accessToken: string,
  limit = 5
): Promise<RecentMedia[]> {
  const data = await graphGet(
    igRecentMediaSchema,
    `${IG_GRAPH_BASE}/${igUserId}/media`,
    accessToken,
    {
      fields: 'id,timestamp',
      limit: String(limit),
    }
  )
  return (data.data ?? []).map((m) => ({ id: m.id, timestamp: m.timestamp ?? null }))
}

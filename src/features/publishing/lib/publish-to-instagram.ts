import { IG_GRAPH_BASE } from '@/app/api/meta/meta-constants'

export interface PublishResult {
  success: boolean
  mediaId?: string
  error?: string
}

interface ContainerStatus {
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'
  status: string
}

interface ContainerResponse {
  id?: string
  error?: { message: string }
}

/** Create a media container on the Instagram Graph API. */
async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  params: Record<string, string | boolean>
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${IG_GRAPH_BASE}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: accessToken }),
  })
  const data: ContainerResponse = await res.json()
  if (!res.ok || !data.id) {
    return { error: data.error?.message ?? 'Container creation failed' }
  }
  return { id: data.id }
}

/** Poll a container until FINISHED or timeout. */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  timeoutMs = 30_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const interval = 3_000

  while (Date.now() < deadline) {
    try {
      // Meta's Graph API requires the access token as a query parameter for GET requests
      const res = await fetch(
        `${IG_GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
      )
      const data: ContainerStatus = await res.json()
      if (data.status_code === 'FINISHED') return true
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') return false
    } catch {
      // Network hiccup — keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

/** Publish a ready container to Instagram. */
async function publishContainer(
  igUserId: string,
  creationId: string,
  accessToken: string
): Promise<PublishResult> {
  const res = await fetch(`${IG_GRAPH_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  })
  const data: ContainerResponse = await res.json()
  if (!res.ok || !data.id) {
    return { success: false, error: data.error?.message ?? 'Publish failed' }
  }
  return { success: true, mediaId: data.id }
}

/** Publish a single image post to Instagram. */
export async function publishSingleImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<PublishResult> {
  try {
    const container = await createMediaContainer(igUserId, accessToken, {
      image_url: imageUrl,
      caption,
    })
    if ('error' in container) return { success: false, error: container.error }

    const ready = await waitForContainer(container.id, accessToken)
    if (!ready) return { success: false, error: 'Container processing timeout' }

    return publishContainer(igUserId, container.id, accessToken)
  } catch (err) {
    return { success: false, error: `Publish failed: ${String(err)}` }
  }
}

/** Publish a carousel post (2–10 images) to Instagram. */
export async function publishCarousel(
  igUserId: string,
  accessToken: string,
  imageUrls: string[],
  caption: string
): Promise<PublishResult> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    return { success: false, error: 'Carousel requires 2–10 images' }
  }

  try {
    const childIds = await createChildContainers(igUserId, accessToken, imageUrls)
    if ('error' in childIds) return { success: false, error: childIds.error }

    const carousel = await createMediaContainer(igUserId, accessToken, {
      media_type: 'CAROUSEL',
      children: childIds.ids.join(','),
      caption,
    })
    if ('error' in carousel) return { success: false, error: carousel.error }

    const ready = await waitForContainer(carousel.id, accessToken)
    if (!ready) return { success: false, error: 'Carousel container timeout' }

    return publishContainer(igUserId, carousel.id, accessToken)
  } catch (err) {
    return { success: false, error: `Carousel publish failed: ${String(err)}` }
  }
}

/** Create one child container per carousel image. */
async function createChildContainers(
  igUserId: string,
  accessToken: string,
  imageUrls: string[]
): Promise<{ ids: string[] } | { error: string }> {
  const ids: string[] = []
  for (const imageUrl of imageUrls) {
    const child = await createMediaContainer(igUserId, accessToken, {
      image_url: imageUrl,
      is_carousel_item: 'true',
    })
    if ('error' in child) return { error: `Child container failed: ${child.error}` }
    ids.push(child.id)
  }
  return { ids }
}

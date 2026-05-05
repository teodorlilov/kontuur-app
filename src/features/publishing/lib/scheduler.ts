import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { publishSingleImage, publishCarousel } from './publish-to-instagram'
import type { PostForPublish, InstagramConnection } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

type DuePost = PostForPublish & { scheduled_at: string }

export interface PublishSchedulerResult {
  processed: number
  published: number
  failed: number
}

/** Find and publish all posts that are due for scheduling. */
export async function publishDuePosts(): Promise<PublishSchedulerResult> {
  const admin = createAdminSupabaseClient()
  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

  const { data: posts } = await admin
    .from('posts')
    .select('id, caption, post_type, scheduled_at, publish_attempts, client_id, post_images(public_url, position)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .gte('scheduled_at', fiveMinutesAgo)
    .lt('publish_attempts', 3)
    .limit(10)

  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  const duePosts = ((posts as unknown as DuePost[]) ?? []).filter(
    (p) => p.post_images.length > 0
  )

  const result: PublishSchedulerResult = { processed: 0, published: 0, failed: 0 }
  const grouped = groupByClientId(duePosts)

  for (const [clientId, clientPosts] of grouped) {
    const connection = await fetchInstagramConnection(admin, clientId)
    for (const post of clientPosts) {
      result.processed++
      const ok = await attemptPublish(admin, post, connection)
      if (ok) result.published++
      else result.failed++
    }
  }

  return result
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

/** Attempt to publish a single post to Instagram. */
async function attemptPublish(
  admin: SupabaseClient,
  post: DuePost,
  connection: InstagramConnection | null
): Promise<boolean> {
  if (!connection) {
    await markFailed(admin, post.id, 'No Instagram account connected', post.publish_attempts)
    return false
  }

  if (isTokenExpired(connection.token_expires_at)) {
    await markFailed(admin, post.id, 'Instagram token expired', post.publish_attempts)
    return false
  }

  const imageUrls = post.post_images
    .sort((a, b) => a.position - b.position)
    .map((img) => img.public_url)

  const caption = post.caption ?? ''
  const result = imageUrls.length === 1
    ? await publishSingleImage(connection.account_id, connection.access_token, imageUrls[0]!, caption)
    : await publishCarousel(connection.account_id, connection.access_token, imageUrls, caption)

  if (result.success) {
    await markPublished(admin, post.id, result.mediaId ?? null)
    return true
  }

  await markFailed(admin, post.id, result.error ?? 'Unknown error', post.publish_attempts)
  return false
}

async function fetchInstagramConnection(
  admin: SupabaseClient,
  clientId: string
): Promise<InstagramConnection | null> {
  const { data } = await admin
    .from('social_connections')
    .select('account_id, access_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .single()
  // Supabase select returns the exact fields we project; narrow to InstagramConnection
  return data as InstagramConnection | null
}

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

async function markPublished(admin: SupabaseClient, postId: string, mediaId: string | null): Promise<void> {
  await admin
    .from('posts')
    .update({
      status: 'published',
      ig_media_id: mediaId,
      published_at: new Date().toISOString(),
      publish_error: null,
    })
    .eq('id', postId)
}

async function markFailed(
  admin: SupabaseClient,
  postId: string,
  error: string,
  currentAttempts: number
): Promise<void> {
  const attempts = currentAttempts + 1
  await admin
    .from('posts')
    .update({
      status: attempts >= 3 ? 'failed' : 'scheduled',
      publish_error: error,
      publish_attempts: attempts,
    })
    .eq('id', postId)
}

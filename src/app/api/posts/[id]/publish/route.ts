import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { publishSingleImage, publishCarousel } from '@/features/publishing/lib/publish-to-instagram'
import type { PostForPublish, InstagramConnection } from '@/features/publishing/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type PostWithImages = PostForPublish & { status: string; scheduled_at: string | null }

/** Fetch the post with joined images from the database. */
async function fetchPostForPublish(
  admin: SupabaseClient,
  postId: string
): Promise<PostWithImages | null> {
  const { data } = await admin
    .from('posts')
    .select('id, caption, post_type, status, scheduled_at, publish_attempts, client_id, post_images(public_url, position)')
    .eq('id', postId)
    .single()
  // Supabase cannot infer the joined post_images shape; cast to our known query projection
  return data as unknown as PostWithImages | null
}

/** Fetch the Instagram connection for a client. */
async function fetchConnection(
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

/** Publish a post to Instagram immediately. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const ownership = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!ownership) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  try {
    const post = await fetchPostForPublish(admin, postId)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.status === 'published') return NextResponse.json({ error: 'Already published' }, { status: 400 })
    if (post.post_images.length === 0) return NextResponse.json({ error: 'Post has no images' }, { status: 400 })

    const conn = await fetchConnection(admin, post.client_id)
    if (!conn) return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Instagram token expired' }, { status: 400 })
    }

    // Conditional claim — skips if the cron scheduler (or another request) is mid-publish
    const { data: claimed } = await admin
      .from('posts')
      .update({ status: 'publishing', publish_attempts: post.publish_attempts + 1 })
      .eq('id', postId)
      .neq('status', 'publishing')
      .select('id')
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Post is already being published' }, { status: 409 })
    }

    const imageUrls = post.post_images.sort((a, b) => a.position - b.position).map((img) => img.public_url)
    const caption = post.caption ?? ''
    const result = imageUrls.length === 1
      ? await publishSingleImage(conn.account_id, conn.access_token, imageUrls[0]!, caption)
      : await publishCarousel(conn.account_id, conn.access_token, imageUrls, caption)

    if (result.success) {
      const now = new Date().toISOString()
      await admin.from('posts').update({
        status: 'published',
        ig_media_id: result.mediaId ?? null,
        published_at: now,
        publish_error: null,
        ...(post.scheduled_at ? {} : { scheduled_at: now }),
      }).eq('id', postId)
      return NextResponse.json({ ok: true, mediaId: result.mediaId ?? null })
    }

    await admin.from('posts').update({ status: 'failed', publish_error: result.error }).eq('id', postId)
    return NextResponse.json({ error: result.error }, { status: 500 })
  } catch (err) {
    console.error('Publish error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

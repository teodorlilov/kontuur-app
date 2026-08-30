import { NextResponse, after } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  PUBLISHABLE_POST_COLUMNS,
  publishOnePost,
  resumePendingPublish,
  type PublishablePost,
} from '@/features/publishing/lib/publish-post'
import type { InstagramConnection } from '@/features/publishing/lib/types'
import { SOCIAL_CONNECTION_AUTH_COLUMNS } from '@/lib/queries/select-columns'

/**
 * Publish a post to Instagram immediately. Thin over publishOnePost — the cron
 * scheduler runs the same implementation, so the claim, the platform guard and
 * the retry ladder cannot diverge between the two entry points.
 *
 * Deferred by design: the response goes out as soon as the container exists and
 * its id is persisted (~1–2s), and polling + media_publish continue after the
 * response via after(). The client watches the post's status for the outcome;
 * the cron's resume arm is the backstop if this invocation dies.
 */

// The after() continuation polls for up to ~40s past the response.
export const maxDuration = 60
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const ownership = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!ownership) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  try {
    const { data, error } = await admin
      .from('posts')
      .select(PUBLISHABLE_POST_COLUMNS)
      .eq('id', postId)
      .maybeSingle()
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    // Supabase cannot infer the joined post_images shape; cast to our known query projection
    const post = data as unknown as PublishablePost | null
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.status === 'published')
      return NextResponse.json({ error: 'Already published' }, { status: 400 })

    const { data: connData, error: connError } = await admin
      .from('social_connections')
      .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
      .eq('client_id', post.client_id)
      .eq('platform', 'instagram')
      .maybeSingle()
    if (connError) throw new Error(`connection lookup failed: ${connError.message}`)
    // Supabase select returns the exact fields we project; narrow to InstagramConnection
    const connection = connData as InstagramConnection | null

    const outcome = await publishOnePost(admin, post, connection, { skipPoll: true })

    // A never-scheduled post gets its slot stamped as soon as the publish is
    // underway — the cron's backstop window only sees rows with a scheduled_at.
    if (!post.scheduled_at && (outcome.kind === 'published' || outcome.kind === 'pending')) {
      await admin.from('posts').update({ scheduled_at: new Date().toISOString() }).eq('id', postId)
    }

    switch (outcome.kind) {
      case 'published': {
        if (outcome.writeError) console.error(`[publish] ${outcome.writeError}`)
        return NextResponse.json({ ok: true, mediaId: outcome.mediaId })
      }
      case 'pending':
        // Finish out of band: this invocation keeps polling after the response
        // and completes the publish; the client watches the post's status.
        after(() => resumePendingPublish(admin, postId, 40_000))
        return NextResponse.json(
          { ok: true, pending: true, message: 'Publishing to Instagram…' },
          { status: 202 }
        )
      case 'not_claimed':
        return NextResponse.json({ error: 'Post is already being published' }, { status: 409 })
      case 'failed':
        if (outcome.writeError) console.error(`[publish] ${outcome.writeError}`)
        return NextResponse.json({ error: outcome.error }, { status: 500 })
    }
  } catch (err) {
    console.error('Publish error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

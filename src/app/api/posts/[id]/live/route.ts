import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { fetchConnection } from '@/features/publishing/lib/connection'
import { resolveNetwork } from '@/lib/meta/networks'
import type { LiveLink } from '@/features/publishing/lib/live-links'
import type { PostPublicationRow } from '@/types'

/**
 * Where a published post can be seen, per destination.
 *
 * Resolved on demand rather than stored at publish time, and that is the whole design: a post
 * deleted on the network would leave a stored permalink pointing at a 404 with nothing to say
 * it had gone. Asking the network each time makes "this post is no longer on Instagram" an
 * answer we can actually give — and it is a rare request, made only when someone opens a
 * published post, so there is no cost worth trading that for.
 *
 * Read-only. It resolves nothing about a destination that never published.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const ownership = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!ownership) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('post_publications')
    .select('platform, external_post_id')
    .eq('post_id', postId)
    .eq('status', 'published')
  if (error) {
    console.error(`[live] publication lookup failed for post ${postId}:`, error.message)
    return NextResponse.json({ error: 'Could not read where this post went' }, { status: 500 })
  }

  // WHY as: a two-column select does not infer through the untyped admin client, so the shape
  // is restated — derived from the generated row rather than spelled out, so it cannot drift.
  const published = (data ?? []) as Array<Pick<PostPublicationRow, 'platform' | 'external_post_id'>>

  const links: LiveLink[] = await Promise.all(
    published.map(async ({ platform, external_post_id }) => {
      const adapter = resolveNetwork(platform)
      // No id means the network published but withheld it — there is nothing to look up.
      if (!adapter?.permalink || !external_post_id) return { platform, url: null }
      try {
        const connection = await fetchConnection(admin, ownership.client_id, adapter.platform)
        if (!connection?.access_token) return { platform, url: null }
        const url = await adapter.permalink(
          { accountId: connection.account_id, accessToken: connection.access_token },
          external_post_id
        )
        return { platform, url }
      } catch (err) {
        // Logged here because this IS the boundary, and because the degraded answer is lossy:
        // a deleted post and a dead token both read as "no link", and only the log says which.
        console.error(`[live] ${platform} permalink lookup failed for post ${postId}:`, err)
        return { platform, url: null }
      }
    })
  )

  return NextResponse.json({ links })
}

import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { POST_COLUMNS } from '@/lib/queries/select-columns'

/**
 * Fetch one post.
 *
 * The only handler here. This file also carried a PUT and a DELETE, and both were duplicate
 * implementations of writes that already had a home: PUT restated `updatePostSchema` over the same
 * columns `updatePost` writes, and DELETE removed the row without the `discarded_drafts` telemetry
 * `deletePost` records. Neither had a caller anywhere in src — the only PUT/DELETE fetches in the
 * app target `/canvas`, `/images`, `/settings/account` and `/ai/generate-visual`.
 *
 * They were live authenticated endpoints, so "unused" was not the same as harmless: the DELETE
 * would have silently corrupted source-quality telemetry the moment anything called it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  // Single query: fetch full post + client's agency_id for ownership check.
  // Cast via unknown because Supabase cannot infer types from template-literal select strings.
  const { data: rawPost } = await supabase
    .from('posts')
    .select(`${POST_COLUMNS}, clients(agency_id)`)
    .eq('id', id)
    .single()

  if (!rawPost) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  type RawPost = Record<string, unknown> & { clients: { agency_id: string } | null }
  const typed = rawPost as unknown as RawPost

  // Verify ownership in memory — no extra round-trip
  if (!typed.clients || typed.clients.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Strip the joined clients field before returning
  const { clients: _clients, ...post } = typed
  return NextResponse.json({ post })
}

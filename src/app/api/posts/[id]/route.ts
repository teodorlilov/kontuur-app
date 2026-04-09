import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'

const POST_COLUMNS = 'id, client_id, caption, platform, post_type, slides_json, carousel_quality_json, status, priority, scheduled_at, published_at, quality_score_avg, was_rewritten, rewrite_count, source_url, source_title, source_type, created_at'

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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, id, agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {}
  if (body.status !== undefined) updatePayload.status = body.status
  if (body.caption !== undefined) updatePayload.caption = body.caption
  if (body.slides_json !== undefined) updatePayload.slides_json = body.slides_json
  if (body.scheduled_at !== undefined) updatePayload.scheduled_at = body.scheduled_at
  if (body.platform !== undefined) updatePayload.platform = body.platform
  if (body.was_rewritten !== undefined) updatePayload.was_rewritten = body.was_rewritten
  if (body.rewrite_count !== undefined) updatePayload.rewrite_count = body.rewrite_count
  if (body.source_url !== undefined) updatePayload.source_url = body.source_url
  if (body.source_title !== undefined) updatePayload.source_title = body.source_title

  const { data: updated, error } = await supabase
    .from('posts')
    .update(updatePayload)
    .eq('id', id)
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ post: updated })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, id, agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  await supabase.from('posts').delete().eq('id', id)

  return NextResponse.json({ success: true })
}

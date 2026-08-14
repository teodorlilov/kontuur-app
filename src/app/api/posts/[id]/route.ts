import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { parsePostUpdate } from '@/lib/validation/post-update-schema'
import { POST_COLUMNS } from '@/lib/queries/select-columns'

/** Fetch one post. */
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

/** Update one post's fields. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, id, agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // The same whitelist the server action enforces, from the same schema. This route
  // used to restate all eleven fields, which is how it came to validate
  // `quality_score_avg` while the action did not — and how both came to write
  // `scheduled_at` unchecked.
  const parsed = parsePostUpdate(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: updated, error } = await supabase
    .from('posts')
    .update(parsed.updates)
    .eq('id', id)
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ post: updated })
}

/** Delete one post. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, id, agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // A swallowed error here told the caller { success: true } about a row that was
  // still in the table — the optimistic UI removed it until the next hard load.
  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) {
    console.error('[posts] delete failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

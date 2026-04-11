import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { ApprovalResponse, ApprovalPostData, ApprovalBatchData } from '@/types/api'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminSupabaseClient()

  // Fetch all token rows for this batch (client_email stores the batch ID)
  const { data: tokenRows, error } = await supabase
    .from('post_approval_tokens')
    .select('id, post_id, status, client_note, expires_at')
    .eq('batch_id', token)
    .order('created_at', { ascending: true })

  if (error || !tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ error: 'Invalid approval link' }, { status: 404 })
  }

  // Check expiry
  const firstRow = tokenRows[0]!
  if (new Date(firstRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This approval link has expired. Please ask your agency for a new one.' },
      { status: 410 }
    )
  }

  // Check if already responded
  const batchStatus = firstRow.status

  // Fetch post data for each token row
  const postIds = tokenRows.map((r) => r.post_id)
  const { data: posts } = await supabase
    .from('posts')
    .select('id, caption, platform, post_type, slides_json, scheduled_at, pillar, client_id')
    .in('id', postIds)
    .order('scheduled_at', { ascending: true })

  if (!posts || posts.length === 0) {
    return NextResponse.json({ error: 'Posts not found' }, { status: 404 })
  }

  // Build client note lookup from token rows
  const noteMap = new Map(tokenRows.map((r) => [r.post_id, r.client_note]))

  // Fetch client name
  const clientId = posts[0]!.client_id
  const { data: client } = await supabase
    .from('clients')
    .select('name, agency_id')
    .eq('id', clientId)
    .single()

  // Fetch agency name
  let agencyName = ''
  if (client?.agency_id) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('name')
      .eq('id', client.agency_id)
      .single()
    agencyName = agency?.name ?? ''
  }

  const approvalPosts: ApprovalPostData[] = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    platform: p.platform,
    post_type: p.post_type,
    slides_json: p.slides_json,
    scheduled_at: p.scheduled_at,
    pillar: p.pillar,
    client_note: noteMap.get(p.id) ?? null,
  }))

  const result: ApprovalBatchData = {
    posts: approvalPosts,
    clientName: client?.name ?? 'Unknown',
    agencyName,
    status: batchStatus,
    expiresAt: firstRow.expires_at,
  }

  return NextResponse.json(result)
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminSupabaseClient()

  let body: ApprovalResponse
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.status !== 'approved' && body.status !== 'changes_requested') {
    return NextResponse.json(
      { error: 'status must be "approved" or "changes_requested"' },
      { status: 400 }
    )
  }

  // Fetch token rows (client_email stores the batch ID)
  const { data: tokenRows, error } = await supabase
    .from('post_approval_tokens')
    .select('id, post_id, status, expires_at')
    .eq('batch_id', token)

  if (error || !tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ error: 'Invalid approval link' }, { status: 404 })
  }

  // Check expiry
  const firstRow = tokenRows[0]!
  if (new Date(firstRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired' }, { status: 410 })
  }

  // Check if already responded
  if (firstRow.status !== 'pending') {
    return NextResponse.json(
      { error: 'This approval has already been responded to' },
      { status: 409 }
    )
  }

  // Update all token rows with the batch status
  const { error: updateError } = await supabase
    .from('post_approval_tokens')
    .update({ status: body.status })
    .eq('batch_id', token)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Apply per-post notes if provided
  if (body.postNotes && body.postNotes.length > 0) {
    for (const { postId, note } of body.postNotes) {
      await supabase
        .from('post_approval_tokens')
        .update({ client_note: note })
        .eq('batch_id', token)
        .eq('post_id', postId)
    }
  }

  // Post status stays as 'scheduled' — approval is tracked in post_approval_tokens
  const postIds = tokenRows.map((r) => r.post_id)

  // Create notification for the agency
  // First get the agency_id via post → client → agency chain
  const { data: firstPost } = await supabase
    .from('posts')
    .select('client_id')
    .eq('id', postIds[0]!)
    .single()

  if (firstPost) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, agency_id')
      .eq('id', firstPost.client_id)
      .single()

    if (client) {
      const message =
        body.status === 'approved'
          ? `${client.name} approved weekly calendar (${postIds.length} post${postIds.length === 1 ? '' : 's'})`
          : `${client.name} requested changes on weekly calendar`

      await supabase.from('notifications').insert({
        agency_id: client.agency_id,
        message,
      })
    }
  }

  return NextResponse.json({ success: true })
}

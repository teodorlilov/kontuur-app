import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createApprovalNotification } from '@/features/review/lib/create-approval-notification'
import { getClientFeedSystem } from '@/lib/brand-kit/queries'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_TOKENS, type BrandTokens } from '@/lib/scene-graph'
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

  // Fetch client name + agency name in one join — saves one round-trip
  const clientId = posts[0]!.client_id
  const { data: client } = await supabase
    .from('clients')
    .select('name, agencies!inner(name)')
    .eq('id', clientId)
    .single() as { data: { name: string; agencies: { name: string } } | null }

  const agencyName = (client?.agencies as { name: string } | null)?.name ?? ''

  // The client's visual kit, so the approval page can render the designed slides read-only (the token
  // authorizes this client, so no agency check — load the kit directly).
  // brand_kits is not in the generated Database types yet — cast to an untyped client (same pattern as
  // the other composition-engine reads) until `supabase gen types`.
  const untyped = supabase as unknown as SupabaseClient
  const [{ data: kitRow }, feedSystem] = await Promise.all([
    untyped.from('brand_kits').select('tokens').eq('client_id', clientId).maybeSingle(),
    getClientFeedSystem(clientId),
  ])
  const visualKit = {
    tokens: feedSystemTokens(feedSystem.slug, ((kitRow as { tokens?: BrandTokens } | null)?.tokens) ?? DEFAULT_TOKENS),
    feedSystemSlug: feedSystem.slug,
    clientName: client?.name ?? '',
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
    visualKit,
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
    .update({ status: body.status, responded_at: new Date().toISOString() })
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
  const { data: postWithClient } = await supabase
    .from('posts')
    .select('client_id, clients!inner(name, agency_id)')
    .eq('id', postIds[0]!)
    .single() as { data: { client_id: string; clients: { name: string; agency_id: string } } | null }

  if (postWithClient) {
    const firstNote = body.postNotes?.[0]?.note ?? null
    await createApprovalNotification(supabase, {
      agencyId: postWithClient.clients.agency_id,
      clientName: postWithClient.clients.name,
      clientId: postWithClient.client_id,
      postCount: postIds.length,
      status: body.status,
      feedbackText: body.status === 'changes_requested' ? firstNote : null,
      reviewToken: token,
      postId: postIds[0] ?? null,
    })
  }

  return NextResponse.json({ success: true })
}

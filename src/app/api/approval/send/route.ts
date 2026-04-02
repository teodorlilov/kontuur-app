import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { APPROVAL_TOKEN_EXPIRY_HOURS } from '@/utils/constants'
import type { SendApprovalRequest } from '@/types/api'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: SendApprovalRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { clientId, weekStart } = body
  if (!clientId || !weekStart) {
    return NextResponse.json({ error: 'clientId and weekStart are required' }, { status: 400 })
  }

  // Validate weekStart is a valid date
  const weekStartDate = new Date(weekStart)
  if (isNaN(weekStartDate.getTime())) {
    return NextResponse.json({ error: 'weekStart must be a valid ISO date' }, { status: 400 })
  }

  // Verify client belongs to agency
  const owns = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owns) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Calculate week range (Monday to Sunday)
  const weekEnd = new Date(weekStartDate)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // Fetch posts for this client in the week range
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id')
    .eq('client_id', clientId)
    .gte('scheduled_at', weekStartDate.toISOString())
    .lte('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 })
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ error: 'No posts scheduled for this week' }, { status: 400 })
  }

  // Generate batch ID (used in the URL) + unique token per row
  const batchId = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + APPROVAL_TOKEN_EXPIRY_HOURS)

  const postIds = posts.map((p) => p.id)

  // Remove any existing approval tokens for these posts so we can re-send
  await supabase
    .from('post_approval_tokens')
    .delete()
    .in('post_id', postIds)

  // Insert one token row per post
  const tokenRows = posts.map((p) => ({
    post_id: p.id,
    token: crypto.randomUUID(),
    batch_id: batchId,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
  }))

  const { error: insertError } = await supabase
    .from('post_approval_tokens')
    .insert(tokenRows)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Build approval URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const approvalUrl = `${appUrl}/approve/${batchId}`

  // Fetch client name for notification
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

  const clientName = client?.name ?? 'Unknown'

  // Create notification
  await supabase.from('notifications').insert({
    agency_id: agencyId,
    message: `Approval link generated for ${clientName} — ${posts.length} post${posts.length === 1 ? '' : 's'}`,
  })

  return NextResponse.json({
    success: true,
    url: approvalUrl,
    postCount: posts.length,
  })
}

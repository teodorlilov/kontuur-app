import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientWithOwnership } from '@/lib/auth/helpers'
import { createApprovalBatch } from '@/features/review/lib/approval-batch'
import { approvalRequestSchema } from '@/features/review/schemas'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = approvalRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'clientId plus weekStart or postIds required' }, { status: 400 })
  }
  const { clientId, weekStart, postIds } = parsed.data

  const client = await fetchClientWithOwnership(supabase, clientId, agencyId)
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const result = await createApprovalBatch(supabase, clientId, weekStart ?? null, null, { postIds })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const approvalUrl = `${appUrl}/approve/${result.batchId}`

  await supabase.from('notifications').insert({
    agency_id: agencyId,
    message: `Approval link generated for ${client.name} — ${result.postCount} post${result.postCount === 1 ? '' : 's'}`,
  })

  // Responding to an approval already invalidated this tag, but *sending* one
  // never did — so the Clients roster would keep reporting nothing awaiting
  // approval for up to 60s after a batch went out.
  revalidateTag('client-post-stats', 'max')

  return NextResponse.json({
    success: true,
    url: approvalUrl,
    postCount: result.postCount,
  })
}

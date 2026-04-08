import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { createApprovalBatch } from '@/lib/approval/batch'
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

  const owns = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owns) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const result = await createApprovalBatch(supabase, clientId, weekStart)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const approvalUrl = `${appUrl}/approve/${result.batchId}`

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

  await supabase.from('notifications').insert({
    agency_id: agencyId,
    message: `Approval link generated for ${client?.name ?? 'client'} — ${result.postCount} post${result.postCount === 1 ? '' : 's'}`,
  })

  return NextResponse.json({
    success: true,
    url: approvalUrl,
    postCount: result.postCount,
  })
}

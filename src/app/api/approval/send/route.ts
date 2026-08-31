import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientWithOwnership } from '@/lib/auth/helpers'
import { createApprovalBatch } from '@/features/approval-portal/lib/approval-batch'
import { getCachedAgency } from '@/lib/queries/cache'
import { approvalRequestSchema } from '@/lib/approval/schema'
import { pluralise } from '@/utils/format'
import { notify, NOTIFY_EVERY_TIME } from '@/features/publishing/lib/notifications'

/** Create an approval batch and return its link for the agency to share manually. */
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
    return NextResponse.json(
      { error: 'clientId plus weekStart or postIds required' },
      { status: 400 }
    )
  }
  const { clientId, weekStart, postIds } = parsed.data

  const client = await fetchClientWithOwnership(supabase, clientId, agencyId)
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // The batch window resolves in the agency's zone, matching the calendar that
  // labelled the button. Without it the server built a UTC week and emailed a
  // different set of posts than the caller named.
  const agency = await getCachedAgency(agencyId)
  const result = await createApprovalBatch(
    supabase,
    clientId,
    weekStart ?? null,
    agency?.timezone ?? 'UTC',
    null,
    { postIds }
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const approvalUrl = `${appUrl}/approve/${result.batchId}`

  // Logged, not failed: the batch and its link already exist, so failing the
  // request would hide a working approval URL from the caller.
  await notify(supabase, {
    agencyId,
    clientId,
    message: `Approval link generated for ${client.name} — ${pluralise(result.postCount, 'post')}`,
    cooldownDays: NOTIFY_EVERY_TIME,
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

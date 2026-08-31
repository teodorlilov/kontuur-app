import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { approvalRequestSchema } from '@/lib/approval/schema'
import { sendForApproval } from '@/features/approval-portal/lib/send-for-approval'

/** Create an approval batch and email the client the link. */
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

  const result = await sendForApproval(supabase, {
    agencyId,
    clientId,
    weekStart,
    postIds,
    channel: 'email',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // The URL is deliberately not returned: the client has it, and the agency did not ask for a
  // copyable link on this path.
  return NextResponse.json({ success: true, postCount: result.postCount })
}

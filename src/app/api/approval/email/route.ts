import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { createApprovalBatch } from '@/features/review/lib/approval-batch'
import { getCachedAgency } from '@/lib/queries/cache'
import { approvalRequestSchema } from '@/lib/approval/schema'
import { pluralise } from '@/utils/format'
import { sendApprovalEmail } from '@/lib/email/resend'

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
    return NextResponse.json({ error: 'clientId plus weekStart or postIds required' }, { status: 400 })
  }
  const { clientId, weekStart, postIds } = parsed.data

  const owns = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owns) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // contact_email is always fetched from DB — never trusted from the request body
  const { data: client } = await supabase
    .from('clients')
    .select('name, contact_email')
    .eq('id', clientId)
    .single()

  if (!client?.contact_email) {
    return NextResponse.json(
      { error: 'No contact email set for this client. Add one in the client settings.' },
      { status: 400 }
    )
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
    client.contact_email,
    { postIds }
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const approvalUrl = `${appUrl}/approve/${result.batchId}`

  try {
    await sendApprovalEmail({
      to: client.contact_email,
      clientName: client.name,
      approvalUrl,
      postCount: result.postCount,
    })
  } catch (err) {
    console.error('Resend error:', err)
    return NextResponse.json(
      { error: 'Failed to send email. Check RESEND_API_KEY and RESEND_FROM_EMAIL.' },
      { status: 500 }
    )
  }

  // Logged, not failed: the email is already out, and reporting an error here
  // would invite a resend that mails the client a second time.
  const { error: notifyError } = await supabase.from('notifications').insert({
    agency_id: agencyId,
    message: `Approval email sent to ${client.contact_email} for ${client.name} — ${pluralise(result.postCount, 'post')}`,
  })
  if (notifyError) {
    console.error('[approval] sent-notification insert failed:', notifyError.message)
  }

  return NextResponse.json({ success: true, postCount: result.postCount })
}

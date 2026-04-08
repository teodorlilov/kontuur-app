import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { createApprovalBatch } from '@/lib/approval/batch'
import { sendApprovalEmail } from '@/lib/email/resend'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: { clientId: string; weekStart: string }
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

  const result = await createApprovalBatch(supabase, clientId, weekStart, client.contact_email)
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
    return NextResponse.json({ error: 'Failed to send email. Check RESEND_API_KEY and RESEND_FROM_EMAIL.' }, { status: 500 })
  }

  await supabase.from('notifications').insert({
    agency_id: agencyId,
    message: `Approval email sent to ${client.contact_email} for ${client.name} — ${result.postCount} post${result.postCount === 1 ? '' : 's'}`,
  })

  return NextResponse.json({ success: true, postCount: result.postCount })
}

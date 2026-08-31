import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { createApprovalBatch } from './approval-batch'
import { getCachedAgency } from '@/lib/queries/cache'
import { notify, NOTIFY_EVERY_TIME } from '@/lib/notifications/notify'
import { sendApprovalEmail } from '@/lib/email/resend'
import { pluralise } from '@/utils/format'

/** How the client receives the link: the agency copies it, or we email it for them. */
export type ApprovalChannel = 'link' | 'email'

export interface SendForApprovalInput {
  agencyId: string
  clientId: string
  weekStart?: string | null
  postIds?: string[]
  channel: ApprovalChannel
}

export type SendForApprovalResult =
  | { ok: true; url: string; postCount: number }
  | { ok: false; error: string; status: number }

/**
 * Send a week — or a hand-picked set of posts — to a client for sign-off.
 *
 * ONE operation with two channels, not two operations. `/api/approval/send` and
 * `/api/approval/email` each implemented the whole thing end to end, sharing only
 * `createApprovalBatch`, and had already drifted four ways:
 *
 *  - two different ownership checks, the email one followed by a SECOND `clients` read;
 *  - only the link route called `revalidateTag('client-post-stats')`, so the Clients roster
 *    under-reported awaiting-approval for up to 60s after an email batch — the exact bug the
 *    link route's own comment says that line was added to fix;
 *  - neither passed `notify()` a `type`, so both landed type-less and the bell rendered them as
 *    "requested changes";
 *  - the batch window resolved from the agency timezone in both, by copied comment.
 *
 * The routes are now adapters: they choose a channel and shape the HTTP error.
 */
export async function sendForApproval(
  supabase: SupabaseClient,
  input: SendForApprovalInput
): Promise<SendForApprovalResult> {
  const { agencyId, clientId, weekStart, postIds, channel } = input

  // One read that is BOTH the ownership check and the data the operation needs. The two routes
  // asked this question differently, and the email one asked twice.
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .maybeSingle()

  if (!client) return { ok: false, error: 'Client not found', status: 404 }
  const { name, contact_email: contactEmail } = client as {
    name: string
    contact_email: string | null
  }

  // Checked before the batch is built: minting tokens and then failing would retire the client's
  // previous working link to produce nothing.
  if (channel === 'email' && !contactEmail) {
    return {
      ok: false,
      error: 'No contact email set for this client. Add one in the client settings.',
      status: 400,
    }
  }

  // The batch window resolves in the agency's zone, matching the calendar that labelled the
  // button. Without it the server builds a UTC week and sends a different set of posts than the
  // caller named.
  const agency = await getCachedAgency(agencyId)
  const result = await createApprovalBatch(
    supabase,
    clientId,
    weekStart ?? null,
    agency?.timezone ?? 'UTC',
    // Recorded only when we actually mailed someone. Nothing reads this column today — the one
    // reference to it is a comment in the portal route that misdescribes it as the batch id.
    channel === 'email' ? contactEmail : null,
    { postIds }
  )
  if (!result.ok) return { ok: false, error: result.error, status: result.status }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const url = `${appUrl}/approve/${result.batchId}`

  if (channel === 'email' && contactEmail) {
    try {
      await sendApprovalEmail({
        to: contactEmail,
        clientName: name,
        approvalUrl: url,
        postCount: result.postCount,
      })
    } catch (err) {
      console.error('[approval] email send failed:', err)
      // The provider's own words, not a guess: the SDK resolves rather than throws on a rejected
      // send, so a generic "check your API key" hid the common failure.
      const reason = err instanceof Error ? err.message : 'unknown error'
      return { ok: false, error: `Could not send the email — ${reason}`, status: 500 }
    }
  }

  // Logged, not failed, for both channels: the link exists (and the email is already out) by this
  // point, so reporting an error here would hide a working URL or invite a second send.
  await notify(supabase, {
    agencyId,
    clientId,
    // Without this the row is type-less, and the bell's message fallback reads it as a change
    // request — see NotificationType.
    type: 'approval_sent',
    message:
      channel === 'email'
        ? `Approval email sent to ${contactEmail} for ${name} — ${pluralise(result.postCount, 'post')}`
        : `Approval link generated for ${name} — ${pluralise(result.postCount, 'post')}`,
    cooldownDays: NOTIFY_EVERY_TIME,
  })

  // Responding to an approval already invalidated this tag, but *sending* one did so on only one
  // of the two channels.
  revalidateTag('client-post-stats', 'max')

  return { ok: true, url, postCount: result.postCount }
}

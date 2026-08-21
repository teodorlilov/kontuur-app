import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { MS_PER_DAY } from '@/utils/constants'

/** Suppress duplicate notifications with the same message for this long. */
const NOTIFY_COOLDOWN_DAYS = 7

/** The cooldown check and the insert — the half that never needed the client's name. */
async function insertOnce(
  admin: SupabaseClient,
  agencyId: string,
  clientId: string,
  message: string,
  cooldownDays: number
): Promise<void> {
  const since = new Date(Date.now() - cooldownDays * MS_PER_DAY).toISOString()
  const { data: existing, error: existingError } = await admin
    .from('notifications')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('message', message)
    .gte('created_at', since)
    .limit(1)
  // Reading the cooldown as "none sent" would re-notify on every cron tick.
  if (existingError) throw new Error(`notification cooldown check failed: ${existingError.message}`)
  if (existing && existing.length > 0) return

  const { error: insertError } = await admin.from('notifications').insert({
    agency_id: agencyId,
    client_id: clientId,
    message,
  })
  if (insertError) throw new Error(`notification insert failed: ${insertError.message}`)
}

/**
 * Insert an agency notification about a client, at most once per cooldown for
 * the same message. For a message that needs the client's NAME, use
 * `notifyAboutClient` — it reads both columns in one query instead of two.
 */
export async function insertClientNotificationOnce(
  admin: SupabaseClient,
  clientId: string,
  message: string,
  cooldownDays: number = NOTIFY_COOLDOWN_DAYS
): Promise<void> {
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('agency_id')
    .eq('id', clientId)
    .maybeSingle()
  if (clientError) throw new Error(`client lookup failed: ${clientError.message}`)
  const agencyId = (client as { agency_id: string | null } | null)?.agency_id
  if (!agencyId) return
  await insertOnce(admin, agencyId, clientId, message, cooldownDays)
}

/**
 * The same thing for a message that names the client.
 *
 * Three callers — the token refresher and both metrics alerts — had each written
 * the same function: look up `clients.name`, throw on error, return if absent,
 * then call the helper above, which went and read the SAME row again for its
 * agency_id. One query now serves both halves, and the only thing a caller
 * still supplies is its sentence.
 *
 * `buildMessage` must be phrase-stable for a given condition: the message text
 * IS the dedup key, so wording that varies with the error re-notifies nightly.
 */
export async function notifyAboutClient(
  admin: SupabaseClient,
  clientId: string,
  buildMessage: (clientName: string) => string,
  cooldownDays: number = NOTIFY_COOLDOWN_DAYS
): Promise<void> {
  const { data: client, error } = await admin
    .from('clients')
    .select('agency_id, name')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(`client lookup failed: ${error.message}`)
  const row = client as { agency_id: string | null; name: string } | null
  if (!row?.agency_id) return
  await insertOnce(admin, row.agency_id, clientId, buildMessage(row.name), cooldownDays)
}

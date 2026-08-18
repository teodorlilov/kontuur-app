import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { MS_PER_DAY } from '@/utils/constants'

/** Suppress duplicate notifications with the same message for this long. */
const NOTIFY_COOLDOWN_DAYS = 7

/**
 * Insert an agency notification about a client, at most once per cooldown for
 * the same message. Shared by token refresh (reconnect prompts) and the publish
 * pipeline (final failures) — both run on crons where every tick would
 * otherwise re-notify.
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
  if (!client?.agency_id) return

  const since = new Date(Date.now() - cooldownDays * MS_PER_DAY).toISOString()
  const { data: existing, error: existingError } = await admin
    .from('notifications')
    .select('id')
    .eq('agency_id', client.agency_id)
    .eq('message', message)
    .gte('created_at', since)
    .limit(1)
  // Reading the cooldown as "none sent" would re-notify on every cron tick.
  if (existingError) throw new Error(`notification cooldown check failed: ${existingError.message}`)
  if (existing && existing.length > 0) return

  const { error: insertError } = await admin.from('notifications').insert({
    agency_id: client.agency_id,
    client_id: clientId,
    message,
  })
  if (insertError) throw new Error(`notification insert failed: ${insertError.message}`)
}

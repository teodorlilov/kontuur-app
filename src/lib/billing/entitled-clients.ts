import 'server-only'

import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AGENCY_ENTITLEMENT_COLUMNS } from '@/lib/queries/select-columns'
import { allows, entitlementFor, type Entitlement, type EntitlementNeed } from './entitlement'

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

interface EntitledClient {
  agencyId: string
  entitlement: Entitlement
}

/**
 * The clients a cron may do `need` for, keyed by client id, with the entitlement each one spends
 * against — one read of every agency's billing columns (the table is tens of rows) and one read
 * of their clients, per tick. Crons filter their roster with this BEFORE any LIMIT, so a paused
 * workspace's rows never occupy the window a paying one needs, and never inside a per-client loop.
 *
 * Fresh reads through the admin client, never the request cache: a cron has no request, and a
 * workspace that paid a minute ago should generate on this tick.
 *
 * An `.in('client_id', …)` filter carries the ids in the URL; past a few hundred clients this
 * becomes a flag column on clients, not a longer list.
 */
export async function fetchEntitledClients(
  admin: AdminClient,
  need: EntitlementNeed
): Promise<Map<string, EntitledClient>> {
  const { data: agencies, error: agencyError } = await admin
    .from('agencies')
    .select(AGENCY_ENTITLEMENT_COLUMNS)
  if (agencyError) throw new Error(`agency roster query failed: ${agencyError.message}`)

  const now = new Date()
  const entitled = new Map<string, Entitlement>()
  for (const agency of agencies ?? []) {
    const entitlement = entitlementFor(agency, now)
    if (allows(entitlement, need)) entitled.set(agency.id, entitlement)
  }
  if (entitled.size === 0) return new Map()

  const { data: clients, error: clientError } = await admin
    .from('clients')
    .select('id, agency_id')
    .in('agency_id', [...entitled.keys()])
  if (clientError) throw new Error(`entitled client roster query failed: ${clientError.message}`)

  const out = new Map<string, EntitledClient>()
  for (const client of clients ?? []) {
    const entitlement = entitled.get(client.agency_id)
    if (entitlement) out.set(client.id, { agencyId: client.agency_id, entitlement })
  }
  return out
}

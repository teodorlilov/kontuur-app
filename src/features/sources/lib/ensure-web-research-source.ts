import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource } from '@/types/api'

/** Postgres unique-violation — a concurrent render won the race to create the row. */
const UNIQUE_VIOLATION = '23505'

/**
 * Return the client's web-research source, creating it on first use.
 *
 * Every client gets one so the toggle is always visible on the sources page, and
 * it is created lazily rather than at client creation so clients that predate the
 * feature get one too. Two concurrent opens can race; the partial unique index
 * from migration 20260808 turns the loser's insert into a 23505 that we read back
 * instead of writing a duplicate toggle.
 */
export async function ensureWebResearchSource(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientSource | null> {
  const { data, error } = await supabase
    .from('client_sources')
    .insert({
      client_id: clientId,
      type: 'tavily',
      label: 'Web research',
      url: '',
      is_active: true,
    })
    .select(CLIENT_SOURCE_FULL_COLUMNS)
    .maybeSingle()

  // Cast through unknown — pillar_ids column added by migration, not yet in generated Supabase types
  if (!error) return data as unknown as ClientSource | null

  if (error.code !== UNIQUE_VIOLATION) {
    throw new Error(`web-research source insert failed: ${error.message}`)
  }

  const { data: existing, error: readError } = await supabase
    .from('client_sources')
    .select(CLIENT_SOURCE_FULL_COLUMNS)
    .eq('client_id', clientId)
    .eq('type', 'tavily')
    .maybeSingle()
  if (readError) throw new Error(`web-research source read-back failed: ${readError.message}`)
  // Cast through unknown — pillar_ids column added by migration, not yet in generated Supabase types
  return existing as unknown as ClientSource | null
}

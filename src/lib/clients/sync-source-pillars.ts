import type { SupabaseClient } from '@supabase/supabase-js'
import { getSourcePillarIds } from '@/lib/clients/content-pillars'
import {
  CLIENT_SOURCE_PILLARS_COLUMNS,
  type ClientSourcePillarsColumns,
} from '@/lib/queries/select-columns'

/**
 * Remove deleted pillar IDs from all sources for a client.
 *
 * Distinct from `updateSource`, which also writes `pillar_ids`: that is the user choosing what a
 * source covers, this is a cascade of a pillar deletion. It is only reachable through
 * `updateBrandProfile` when `content_pillars` loses an id — nothing on the sources screen can
 * invoke it.
 *
 * A source left scoped entirely to deleted pillars becomes `[]`, which means feeds-all rather than
 * feeds-nothing. That is not this function's invention: `resolveEffectivePillarIds` already returns
 * `[]` for that case at read time, deliberately, so every surface behaves that way during the
 * window before this write lands. Persisting `[]` is that read made durable.
 */
export async function removeDeletedPillarIds(
  supabase: SupabaseClient,
  clientId: string,
  deletedIds: string[]
): Promise<void> {
  if (deletedIds.length === 0) return

  const { data: sources } = await supabase
    .from('client_sources')
    .select(CLIENT_SOURCE_PILLARS_COLUMNS)
    .eq('client_id', clientId)

  if (!sources) return

  const deletedSet = new Set(deletedIds)

  // getSourcePillarIds, not a local Array.isArray check: the column is `Json`, so "what counts as a
  // pillar id list" is a decision, and it is already made once — every reader of this column goes
  // through it. A second local answer is how the write and the read start disagreeing.
  const updates = (sources as ClientSourcePillarsColumns[])
    .map((source) => ({ id: source.id, ids: getSourcePillarIds(source.pillar_ids) }))
    .filter(({ ids }) => ids.some((id) => deletedSet.has(id)))
    .map(({ id, ids }) =>
      supabase
        .from('client_sources')
        .update({ pillar_ids: ids.filter((pillarId) => !deletedSet.has(pillarId)) })
        .eq('id', id)
    )

  await Promise.all(updates)
}

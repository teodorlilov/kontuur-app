import type { SupabaseClient } from '@supabase/supabase-js'

/** Remove deleted pillar IDs from all sources for a client. */
export async function removeDeletedPillarIds(
  supabase: SupabaseClient,
  clientId: string,
  deletedIds: string[]
): Promise<void> {
  if (deletedIds.length === 0) return

  const { data: sources } = await supabase
    .from('client_sources')
    .select('id, pillar_ids')
    .eq('client_id', clientId)

  if (!sources) return

  const deletedSet = new Set(deletedIds)

  const updates = (sources as Array<{ id: string; pillar_ids: string[] }>)
    .filter((source) => {
      const ids = Array.isArray(source.pillar_ids) ? source.pillar_ids : []
      return ids.length > 0 && ids.some((id) => deletedSet.has(id))
    })
    .map((source) => {
      const filtered = source.pillar_ids.filter((id) => !deletedSet.has(id))
      return supabase.from('client_sources').update({ pillar_ids: filtered }).eq('id', source.id)
    })

  await Promise.all(updates)
}

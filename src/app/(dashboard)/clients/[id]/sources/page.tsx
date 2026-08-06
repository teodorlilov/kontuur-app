import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireSessionUser } from '@/lib/auth/session'
import { SourcesManager } from '@/features/sources/components/sources-manager'
import { ensureWebResearchSource } from '@/features/sources/lib/ensure-web-research-source'
import { fetchClientById, fetchSourceUsageStats } from '@/lib/queries/db'
import { parsePillarsWithMeta, serializePillars } from '@/lib/clients/content-pillars'
import { CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource, SourceStrategy } from '@/types/api'

export default async function ClientSourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const client = await fetchClientById(supabase, id, agencyId)
  if (!client) notFound()

  // Load existing sources, source strategy, content pillars, and outcome
  // stats in parallel. Stats use the admin client — posts-adjacent tables
  // block user-scoped reads (post_images RLS precedent), ownership is
  // already verified above.
  const [sourcesResult, profileResult, usageStats] = await Promise.all([
    supabase
      .from('client_sources')
      .select(CLIENT_SOURCE_FULL_COLUMNS)
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('brand_profiles')
      .select('source_strategy, content_pillars')
      .eq('client_id', id)
      .maybeSingle(),
    // Stats are decorative: the page is still usable without them, so a failure
    // is logged and swallowed rather than blanking the source manager.
    fetchSourceUsageStats(createAdminSupabaseClient(), id).catch((err: unknown) => {
      console.error('[sources] usage stats unavailable:', err)
      return []
    }),
  ])

  if (sourcesResult.error) {
    throw new Error(`source list query failed: ${sourcesResult.error.message}`)
  }
  if (profileResult.error) {
    throw new Error(`brand profile query failed: ${profileResult.error.message}`)
  }

  // Cast through unknown — pillar_ids column added by migration, not yet in generated Supabase types
  const initialSources = (sourcesResult.data as unknown as ClientSource[] | null) ?? []
  const profile = profileResult.data as {
    source_strategy: unknown
    content_pillars: string | null
  } | null
  const sourceStrategy = (profile?.source_strategy as SourceStrategy | null) ?? {}
  const { pillars, hadMissingIds } = parsePillarsWithMeta(profile?.content_pillars ?? null)

  // Both writes are lazy backfills for clients that predate their feature, so they
  // run on first open rather than at client creation.
  const needsTavily = !initialSources.some((s) => s.type === 'tavily')
  const [pillarWrite, webResearchSource] = await Promise.all([
    hadMissingIds && pillars.length > 0
      ? supabase
          .from('brand_profiles')
          .update({ content_pillars: serializePillars(pillars) })
          .eq('client_id', id)
      : null,
    needsTavily ? ensureWebResearchSource(supabase, id) : null,
  ])

  // A dropped pillar-ID write means the next render regenerates different ids and
  // the pillar filters stop matching stored posts, so it cannot pass silently.
  if (pillarWrite?.error) {
    console.error('[sources] pillar id backfill failed:', pillarWrite.error.message)
  }

  if (webResearchSource) initialSources.unshift(webResearchSource)

  return (
    <SourcesManager
      clientId={id}
      clientName={client.name}
      niche={client.niche ?? ''}
      initialSources={initialSources}
      initialSourceStrategy={sourceStrategy}
      pillars={pillars}
      usageStats={usageStats}
    />
  )
}

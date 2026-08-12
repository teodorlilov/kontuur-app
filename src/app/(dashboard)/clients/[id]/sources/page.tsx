import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireSessionUser } from '@/lib/auth/session'
import { SourcesManager } from '@/features/sources/components/sources-manager'
import { fetchClientById, fetchSourceUsageStats } from '@/lib/queries/db'
import { parsePillarsWithMeta, serializePillars } from '@/lib/clients/content-pillars'
import { CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource } from '@/types/api'

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
      .select('content_pillars')
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

  // WHY as: ClientSource narrows what the generated types leave wide — `type` to its
  // four-value union, and the jsonb `pillar_ids`/`config` to the shapes every writer
  // in the app actually stores. A narrowing cast, not a missing-column workaround.
  const initialSources = (sourcesResult.data as unknown as ClientSource[] | null) ?? []
  const profile = profileResult.data as {
    content_pillars: string | null
  } | null
  const { pillars, hadMissingIds } = parsePillarsWithMeta(profile?.content_pillars ?? null)

  // A lazy backfill for clients that predate pillar ids, so it runs on first open.
  // The web-research row is NOT written here: it is created with the client and
  // backfilled by migration 20260814, because a page render must not decide whether
  // the generation pipeline searches the web.
  const pillarWrite =
    hadMissingIds && pillars.length > 0
      ? await supabase
          .from('brand_profiles')
          .update({ content_pillars: serializePillars(pillars) })
          .eq('client_id', id)
      : null

  // A dropped pillar-ID write means the next render regenerates different ids and
  // the pillar filters stop matching stored posts, so it cannot pass silently.
  if (pillarWrite?.error) {
    console.error('[sources] pillar id backfill failed:', pillarWrite.error.message)
  }

  return (
    <SourcesManager
      clientId={id}
      clientName={client.name}
      niche={client.niche ?? ''}
      initialSources={initialSources}
      pillars={pillars}
      usageStats={usageStats}
      postsPerWeek={client.posts_per_week ?? 0}
    />
  )
}

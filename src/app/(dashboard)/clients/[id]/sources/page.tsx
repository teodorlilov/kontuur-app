import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { SourcesManager } from '@/features/sources/components/sources-manager'
import { fetchClientById } from '@/lib/queries/db'
import { parsePillarsWithMeta, serializePillars } from '@/lib/clients/content-pillars'
import { CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource, SourceStrategy } from '@/types/api'

export default async function ClientSourcesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Verify client belongs to agency
  const client = await fetchClientById(supabase, id, agencyId)
  if (!client) notFound()

  // Load existing sources, source strategy, and content pillars in parallel
  const [sourcesResult, profileResult] = await Promise.all([
    supabase
      .from('client_sources')
      .select(CLIENT_SOURCE_FULL_COLUMNS)
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('brand_profiles')
      .select('source_strategy, content_pillars')
      .eq('client_id', id)
      .single(),
  ])

  // Cast through unknown — pillar_ids column added by migration, not yet in generated Supabase types
  const initialSources = (sourcesResult.data as unknown as ClientSource[] | null) ?? []
  const profile = profileResult.data as {
    source_strategy: unknown
    content_pillars: string | null
  } | null
  const sourceStrategy = (profile?.source_strategy as SourceStrategy | null) ?? {}
  const { pillars, hadMissingIds } = parsePillarsWithMeta(profile?.content_pillars ?? null)

  // Persist generated pillar IDs + auto-create tavily source in parallel
  const pillarWrite =
    hadMissingIds && pillars.length > 0
      ? supabase
          .from('brand_profiles')
          .update({ content_pillars: serializePillars(pillars) })
          .eq('client_id', id)
      : null

  const needsTavily = !initialSources.some((s) => s.type === 'tavily')
  const tavilyWrite = needsTavily
    ? supabase
        .from('client_sources')
        .insert({
          client_id: id,
          type: 'tavily',
          label: 'Web Search',
          url: '',
          is_active: true,
        })
        .select(CLIENT_SOURCE_FULL_COLUMNS)
        .single()
    : null

  const [, tavilyResult] = await Promise.all([pillarWrite, tavilyWrite])

  if (tavilyResult?.data) {
    initialSources.unshift(tavilyResult.data as unknown as ClientSource)
  }

  return (
    <SourcesManager
      clientId={id}
      clientName={client.name}
      niche={client.niche ?? ''}
      initialSources={initialSources}
      initialSourceStrategy={sourceStrategy}
      pillars={pillars}
    />
  )
}

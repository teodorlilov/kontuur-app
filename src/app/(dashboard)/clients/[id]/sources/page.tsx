import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SourcesManager } from '@/features/sources/components/sources-manager'
import type { ClientSource } from '@/types/api'

export default async function ClientSourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ onboarding?: string }>
}) {
  const { id } = await params
  const { onboarding } = await searchParams
  const isOnboarding = onboarding === 'true'

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string } | null
  if (!userData) redirect('/login')

  // Verify client belongs to agency
  const { data: rawClient } = await supabase
    .from('clients')
    .select('id, name, niche')
    .eq('id', id)
    .eq('agency_id', userData.agency_id)
    .single()

  const client = rawClient as { id: string; name: string; niche: string | null } | null
  if (!client) notFound()

  // Load existing sources and source strategy in parallel
  const [sourcesResult, profileResult] = await Promise.all([
    supabase
      .from('client_sources')
      .select('id, client_id, type, label, url, is_active, last_fetched_at, last_fetch_status, last_fetch_error, config, file_path, extracted_text, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('brand_profiles')
      .select('source_strategy')
      .eq('client_id', id)
      .single(),
  ])

  const initialSources = (sourcesResult.data as ClientSource[] | null) ?? []
  const defaultStrategy = { rss: true, website: true, file: true, trend_fallback: true }
  const sourceStrategy = (profileResult.data as { source_strategy: Record<string, boolean> } | null)?.source_strategy ?? defaultStrategy

  return (
    <SourcesManager
      clientId={id}
      clientName={client.name}
      niche={client.niche ?? ''}
      initialSources={initialSources}
      isOnboarding={isOnboarding}
      initialSourceStrategy={sourceStrategy as { rss: boolean; website: boolean; file: boolean; trend_fallback: boolean }}
    />
  )
}

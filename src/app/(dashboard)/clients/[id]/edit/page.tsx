import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients, getCachedEntitlement } from '@/lib/queries/cache'
import { clientRosterRefusal, deleteClientNotice } from '@/lib/billing/copy'
import { ClientSettingsForm } from '@/features/clients/components/settings/client-settings-form'
import { buildInsights, type PillarRow, type ScoreRow } from '@/features/clients/lib/insights'
import { fetchClientPostStats } from '@/features/clients/lib/post-stats'
import {
  fetchClientById,
  fetchBrandProfileByClient,
  fetchClientSourceSummaries,
  fetchConnectionsByClient,
  fetchPostingScheduleByClient,
} from '@/lib/queries/db'
import { parsePillars, summariseSourceScoping } from '@/lib/clients/content-pillars'
import {
  fetchIdeaCounts,
  fetchIdeasForAgency,
  fetchTokenByClient,
} from '@/features/ideas/lib/ideas'
import { fetchVisualIdentity } from '@/lib/visual/queries'
import { fetchStyleMemoDisplay } from '@/lib/learning/style-memo'
import { listFacebookPages } from '@/features/clients/actions/connection-actions'

/** Pillar rows are capped so one prolific client can't pull an unbounded result set. */
const PILLAR_SAMPLE_SIZE = 500
/** Recent scored posts the quality average and trend are drawn from. */
const SCORE_SAMPLE_SIZE = 20
/** How many recent ideas the Idea link tab previews. */
const IDEA_PREVIEW_LIMIT = 3

/**
 * A client's settings, or a solo workspace's own business page; the form renders the page header,
 * since its tab rail and panel share one tab state. Facebook consent lists Pages instead of naming
 * one, so the callback returns with `?choose_page=1` and the Pages load here; the result is passed
 * through, not its list, since a failure collapsed to `[]` would read as "you administer no Pages".
 * Past the client lookup (the 404 gate), every other read is one parallel wave. `overrideTypes` on
 * the scores states what `.not(…, 'is', null)` guarantees, since the filter narrows the rows but
 * not the generated column type. The scoped sources' pillar ids, resolved against the live
 * pillars (`summariseSourceScoping`), go to the form because only the browser knows which pillars a
 * brand re-read proposes, and it must say how many sources a replaced set would free.
 */
export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ choose_page?: string }>
}) {
  const { id } = await params
  const { choose_page: choosePage } = await searchParams
  const { agencyId, role } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const client = await fetchClientById(supabase, id, agencyId)
  if (!client) notFound()

  const facebookPages = choosePage === '1' ? await listFacebookPages() : null

  const [
    agency,
    visualIdentity,
    profile,
    schedule,
    { count: sourceCount },
    recentPostsRes,
    pillarPostsRes,
    postStats,
    connections,
    ideaToken,
    ideaCounts,
    recentIdeas,
    sourceSummaries,
    styleMemo,
    entitlement,
    agencyClients,
  ] = await Promise.all([
    getCachedAgency(agencyId),
    fetchVisualIdentity(id),
    fetchBrandProfileByClient(supabase, id),
    fetchPostingScheduleByClient(supabase, id),
    supabase
      .from('client_sources')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)
      .eq('is_active', true),
    supabase
      .from('posts')
      .select('quality_score_avg')
      .eq('client_id', id)
      .not('quality_score_avg', 'is', null)
      .order('created_at', { ascending: false })
      .limit(SCORE_SAMPLE_SIZE)
      .overrideTypes<ScoreRow[]>(),
    supabase
      .from('posts')
      .select('pillar, status, rewrite_count')
      .eq('client_id', id)
      .not('pillar', 'is', null)
      .limit(PILLAR_SAMPLE_SIZE)
      .overrideTypes<PillarRow[]>(),
    fetchClientPostStats(supabase, id),
    fetchConnectionsByClient(supabase, id),
    fetchTokenByClient(id),
    fetchIdeaCounts(id),
    fetchIdeasForAgency(agencyId, { clientId: id, limit: IDEA_PREVIEW_LIMIT }),
    fetchClientSourceSummaries(supabase, id),
    fetchStyleMemoDisplay(id),
    getCachedEntitlement(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  const insights = buildInsights(recentPostsRes.data ?? [], pillarPostsRes.data ?? [])
  const sourceScoping = summariseSourceScoping(
    sourceSummaries,
    parsePillars(profile?.content_pillars ?? null)
  )

  return (
    <ClientSettingsForm
      clientId={id}
      isSolo={agency?.mode === 'solo'}
      sourceCount={sourceCount ?? 0}
      styleMemo={styleMemo}
      client={client}
      profile={profile}
      schedule={schedule}
      insights={insights}
      publishedCount={postStats.publishedCount}
      pendingCount={postStats.pendingCount}
      scheduledCount={postStats.scheduledCount}
      approvedUnpublishedCount={postStats.approvedUnpublishedCount}
      lastGeneratedAt={postStats.lastGeneratedAt}
      visualIdentity={visualIdentity}
      connections={connections}
      facebookPages={facebookPages}
      ideaToken={ideaToken}
      ideaNewCount={ideaCounts.newCount}
      ideaUsedCount={ideaCounts.usedCount}
      ideaTotalCount={ideaCounts.totalCount}
      recentIdeas={recentIdeas}
      unrestrictedSourceCount={sourceScoping.unrestrictedCount}
      restrictedSourcePillarIds={sourceScoping.restrictedPillarIds}
      deleteRefusal={clientRosterRefusal(role)}
      deleteNotice={deleteClientNotice(entitlement, agencyClients.length)}
    />
  )
}

import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
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

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ choose_page?: string }>
}) {
  const { id } = await params
  const { choose_page: choosePage } = await searchParams
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const client = await fetchClientById(supabase, id, agencyId)
  if (!client) notFound()

  /**
   * The Pages to choose from, loaded here rather than in the tab.
   *
   * Facebook consent yields a token that LISTS Pages instead of naming one, so the callback
   * sends the user back with `?choose_page=1` and the choice happens on this screen. Fetched in
   * the server component because that is where data is fetched — an effect in the modal would be
   * a client-side waterfall for something this page can resolve before it renders.
   *
   * Failure degrades to an empty list; the chooser says so rather than the page falling over on
   * a Graph call that is one step of a flow the user can restart.
   */
  const facebookPages =
    choosePage === '1' ? await listFacebookPages().then((r) => (r.ok ? r.data : [])) : null

  const [
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
  ] = await Promise.all([
    // In the parallel block, not awaited above it: nothing below depends on the identity, so
    // awaiting it first would cost a serial round trip before any of these started.
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
      // `.not(col, 'is', null)` narrows rows but not the generated column type, which stays
      // nullable. The filter is the guarantee; this tells the compiler about it.
      .overrideTypes<ScoreRow[]>(),
    supabase
      .from('posts')
      .select('pillar, status, rewrite_count')
      .eq('client_id', id)
      .not('pillar', 'is', null)
      .limit(PILLAR_SAMPLE_SIZE)
      .overrideTypes<PillarRow[]>(),
    // One aggregate rather than five status-filtered counts plus a last-generated lookup: they
    // all read the same index, so the cost was six round trips for six numbers.
    fetchClientPostStats(supabase, id),
    // Resolved server-side: the header's connection pill must not flicker, and the accounts tab
    // reads the same rows instead of re-fetching them over HTTP.
    fetchConnectionsByClient(supabase, id),
    fetchTokenByClient(id),
    fetchIdeaCounts(id),
    fetchIdeasForAgency(agencyId, { clientId: id, limit: IDEA_PREVIEW_LIMIT }),
    fetchClientSourceSummaries(supabase, id),
    fetchStyleMemoDisplay(id),
  ])

  const insights = buildInsights(recentPostsRes.data ?? [], pillarPostsRes.data ?? [])
  const sourceScoping = summariseSourceScoping(
    sourceSummaries,
    parsePillars(profile?.content_pillars ?? null)
  )

  // The form renders the page header itself: the tab rail and the panel below
  // read the same activeTab state.
  return (
    <ClientSettingsForm
      clientId={id}
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
      // The scoped sources' own pillar ids: the brand re-read has to say how many of them a
      // replaced pillar set would release back to feeding everything, and only the browser knows
      // which pillars are being proposed.
      restrictedSourcePillarIds={sourceScoping.restrictedPillarIds}
    />
  )
}

import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { ClientSettingsForm } from '@/features/clients/components/settings/client-settings-form'
import type { ContentInsights } from '@/features/clients/components/settings/content-insights-tab'
import {
  fetchClientById,
  fetchBrandProfileByClient,
  fetchPostingScheduleByClient,
} from '@/lib/queries/db'
import { getCachedClientPostStats, getCachedPendingRows } from '@/lib/queries/cache'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  const client = await fetchClientById(supabase, id, agencyId)
  if (!client) notFound()

  const [profile, schedule, { count: sourceCount }, recentPostsRes, allPostsRes, postStats, pendingRows] =
    await Promise.all([
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
        .limit(20),
      supabase
        .from('posts')
        .select('pillar, status, rewrite_count')
        .eq('client_id', id)
        .not('pillar', 'is', null),
      getCachedClientPostStats(agencyId),
      getCachedPendingRows(agencyId),
    ])

  // Status card data
  const clientStats = postStats[id]
  const publishedCount = clientStats?.publishedCount ?? 0
  const lastGeneratedAt = clientStats?.lastGeneratedAt ?? null
  const pendingCount = pendingRows.filter((r) => r.client_id === id).length

  // Compute content insights server-side
  const scores = (recentPostsRes.data as Array<{ quality_score_avg: number }> | null) ?? []
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((s, r) => s + r.quality_score_avg, 0) / scores.length) * 10) / 10
      : null

  let trend: ContentInsights['trend'] = 'insufficient_data'
  if (scores.length >= 10) {
    const recentAvg = scores.slice(0, 10).reduce((s, r) => s + r.quality_score_avg, 0) / 10
    const olderAvg =
      scores.slice(10).reduce((s, r) => s + r.quality_score_avg, 0) /
      Math.max(scores.slice(10).length, 1)
    const diff = recentAvg - olderAvg
    trend = diff > 1 ? 'improving' : diff < -1 ? 'declining' : 'stable'
  }

  const allPostRows =
    (allPostsRes.data as Array<{ pillar: string; status: string; rewrite_count: number }> | null) ??
    []

  const pillarApproved = new Map<string, number>()
  const pillarTotal = new Map<string, number>()
  for (const row of allPostRows) {
    pillarTotal.set(row.pillar, (pillarTotal.get(row.pillar) ?? 0) + 1)
    if (row.status === 'approved') {
      pillarApproved.set(row.pillar, (pillarApproved.get(row.pillar) ?? 0) + 1)
    }
  }
  const topApprovedPillars = [...pillarTotal.keys()]
    .sort((a, b) => {
      const rateA = (pillarApproved.get(a) ?? 0) / (pillarTotal.get(a) ?? 1)
      const rateB = (pillarApproved.get(b) ?? 0) / (pillarTotal.get(b) ?? 1)
      return rateB - rateA
    })
    .slice(0, 3)

  const pillarRewrites = new Map<string, number>()
  for (const row of allPostRows) {
    pillarRewrites.set(row.pillar, (pillarRewrites.get(row.pillar) ?? 0) + row.rewrite_count)
  }
  const topRewritePillars = [...pillarRewrites.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pillar]) => pillar)

  const insights: ContentInsights | null =
    avgScore !== null || topApprovedPillars.length > 0
      ? { avgScore, trend, topApprovedPillars, topRewritePillars }
      : null

  return (
    <ClientSettingsForm
      clientId={id}
      sourceCount={sourceCount ?? 0}
      client={client}
      profile={profile}
      schedule={schedule}
      insights={insights}
      publishedCount={publishedCount}
      pendingCount={pendingCount}
      lastGeneratedAt={lastGeneratedAt}
    />
  )
}

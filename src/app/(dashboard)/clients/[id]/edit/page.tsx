import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { ClientEditForm } from '@/features/clients/components/client-edit-form'
import { CLIENT_COLUMNS, BRAND_PROFILE_COLUMNS, POSTING_SCHEDULE_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types/database'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Ownership check folded into data query — single round-trip, agency_id filter implicitly verifies access
  const { data: rawClient } = await supabase
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single()

  if (!rawClient) notFound()

  // All independent queries in parallel — brand_profiles, schedule, and analytics run concurrently
  const [profileRes, scheduleRes, { count: sourceCount }, recentPostsRes, allPostsRes] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select(BRAND_PROFILE_COLUMNS)
      .eq('client_id', id)
      .single(),
    supabase
      .from('posting_schedules')
      .select(POSTING_SCHEDULE_COLUMNS)
      .eq('client_id', id)
      .single(),
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
  ])

  const client = rawClient as Omit<ClientRow, 'agency_id'>
  const profile = profileRes.data as Omit<BrandProfileRow, 'client_id'> | null
  const schedule = scheduleRes.data as Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null

  // Compute content insights server-side
  type ContentInsights = {
    avgScore: number | null
    trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
    topApprovedPillars: string[]
    topRewritePillars: string[]
  }

  const scores = (recentPostsRes.data as Array<{ quality_score_avg: number }> | null) ?? []
  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, r) => s + r.quality_score_avg, 0) / scores.length) * 10) / 10
    : null

  let trend: ContentInsights['trend'] = 'insufficient_data'
  if (scores.length >= 10) {
    const recentAvg = scores.slice(0, 10).reduce((s, r) => s + r.quality_score_avg, 0) / 10
    const olderAvg = scores.slice(10).reduce((s, r) => s + r.quality_score_avg, 0) / Math.max(scores.slice(10).length, 1)
    const diff = recentAvg - olderAvg
    trend = diff > 1 ? 'improving' : diff < -1 ? 'declining' : 'stable'
  }

  const allPostRows = (allPostsRes.data as Array<{ pillar: string; status: string; rewrite_count: number }> | null) ?? []

  // Top approved pillars by approval rate
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

  // Top rewrite pillars by total rewrite count
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

  return <ClientEditForm clientId={id} sourceCount={sourceCount ?? 0} client={client} profile={profile} schedule={schedule} insights={insights} />
}

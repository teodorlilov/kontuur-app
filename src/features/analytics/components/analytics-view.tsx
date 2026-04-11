'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { MetricCards } from './metric-cards'
import { AnalyticsCharts } from './analytics-charts'
import { TopPostsTable } from './top-posts-table'
import { AudienceSection } from './audience-section'
import { MediaTypeBreakdown } from './media-type-breakdown'
import { PostGrid } from './post-grid'
import { PostDayBreakdown } from './post-day-breakdown'
import { FollowerTrend } from './follower-trend'
import { ReportHistory } from './report-history'
import type { AnalyticsReport, AnalyticsMetrics, MetaConnection, IGPost, FBPost } from '@/types/api'

interface AnalyticsViewProps {
  clients: Array<{ id: string; name: string }>
  initialConnections: MetaConnection[]
}

type Preset = '7d' | '30d' | '90d'
type Tab = 'overview' | 'posts' | 'audience'

function getDateRange(preset: Preset): { start: string; end: string } {
  const end = new Date()
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  const start = new Date(end.getTime() - days * 86_400_000)
  return {
    start: start.toISOString().split('T')[0]!,
    end: end.toISOString().split('T')[0]!,
  }
}

export function AnalyticsView({ clients, initialConnections }: AnalyticsViewProps) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? '')
  const [platform, setPlatform] = useState<'instagram' | 'facebook'>(
    (initialConnections[0]?.platform as 'instagram' | 'facebook') ?? 'instagram'
  )
  const [preset, setPreset] = useState<Preset>('30d')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [connections, setConnections] = useState<MetaConnection[]>(initialConnections)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<AnalyticsReport | null>(null)

  const isInitialMount = useRef(true)

  // Fetch connections when the selected client changes.
  // Skip initial mount — connections for the first client are passed as props
  // from the server component, so no client-side fetch is needed on load.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!selectedClientId) return
    setReport(null)
    fetch(`/api/meta/connections?client_id=${selectedClientId}`)
      .then((r) => r.json())
      .then((data: { connections?: MetaConnection[] }) => {
        const conns = data.connections ?? []
        setConnections(conns)
        const firstConn = conns[0]
        if (firstConn) {
          setPlatform(firstConn.platform as 'instagram' | 'facebook')
        }
      })
      .catch(() => setConnections([]))
  }, [selectedClientId])

  const connectedPlatforms = new Set(connections.map((c) => c.platform))

  async function handleGenerateReport() {
    if (!selectedClientId) return
    setGenerating(true)
    setReport(null)
    setActiveTab('overview')
    const { start, end } = getDateRange(preset)
    try {
      const res = await fetch('/api/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClientId,
          platform,
          period_start: start,
          period_end: end,
        }),
      })
      const data = (await res.json()) as { report?: AnalyticsReport; error?: string }
      if (!res.ok || !data.report) {
        throw new Error(data.error ?? 'Failed to generate report')
      }
      setReport(data.report)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleLoadReport = useCallback((loaded: AnalyticsReport) => {
    setReport(loaded)
    setPlatform(loaded.platform as 'instagram' | 'facebook')
    setActiveTab('overview')
  }, [])

  function handleExportPDF() {
    if (!report) return
    window.print()
  }

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">No clients yet. Add a client to get started.</p>
      </div>
    )
  }

  const metrics = report?.metrics_json as AnalyticsMetrics | undefined

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {clients.length > 1 && (
            <div className="w-48">
              <Select
                label="Client"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}

          {/* Platform pills */}
          {connectedPlatforms.size > 0 && (
            <div className="flex gap-1.5">
              {(['instagram', 'facebook'] as const).map((p) => {
                if (!connectedPlatforms.has(p)) return null
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      platform === p
                        ? 'bg-[#534AB7] text-white border-[#534AB7]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {p === 'instagram' ? 'Instagram' : 'Facebook'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Period presets */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  preset === p
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {connectedPlatforms.size === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-800">
              No accounts connected for this client.{' '}
              <a href={`/clients/${selectedClientId}/edit`} className="font-medium underline">
                Connect Instagram or Facebook
              </a>{' '}
              to generate analytics reports.
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              onClick={handleGenerateReport}
              loading={generating}
              disabled={generating || !connectedPlatforms.has(platform)}
            >
              Generate report
            </Button>
            {report && (
              <Button variant="ghost" onClick={handleExportPDF}>
                Export PDF
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Generating state */}
      {generating && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-gray-500">Fetching data from {platform}…</p>
        </div>
      )}

      {/* Report */}
      {!generating && report && metrics && (
        <div id="analytics-print-area" className="space-y-6">
          {/* Print header */}
          <div className="hidden print:block mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {clients.find((c) => c.id === selectedClientId)?.name} —{' '}
              {report.platform.charAt(0).toUpperCase() + report.platform.slice(1)} Report
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Period: {report.period_start} to {report.period_end}
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-gray-200">
            {(['overview', 'posts', 'audience'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-[#534AB7] text-[#534AB7]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* AI Summary (all tabs) */}
          <div className="bg-[#534AB7]/5 border border-[#534AB7]/20 rounded-xl p-5">
            <p className="text-xs font-semibold text-[#534AB7] uppercase tracking-wide mb-2">
              AI Summary
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {report.ai_summary
                .replace(/^#+\s.+\n?/gm, '')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .trim()}
            </p>
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <MetricCards metrics={metrics} />
              <AnalyticsCharts metrics={metrics} />
              <MediaTypeBreakdown metrics={metrics} />
              <TopPostsTable metrics={metrics} limit={3} />
            </div>
          )}

          {/* Posts tab */}
          {activeTab === 'posts' &&
            (() => {
              const igPosts = metrics.platform === 'instagram' ? (metrics.posts as IGPost[]) : []
              const fbPosts = metrics.platform === 'facebook' ? (metrics.posts as FBPost[]) : []
              const totalLikes =
                metrics.platform === 'instagram'
                  ? igPosts.reduce((s, p) => s + p.like_count, 0)
                  : fbPosts.reduce((s, p) => s + p.reactions, 0)
              const totalComments =
                metrics.platform === 'instagram'
                  ? igPosts.reduce((s, p) => s + p.comments_count, 0)
                  : fbPosts.reduce((s, p) => s + p.comments, 0)
              const totalReachFromPosts =
                metrics.platform === 'instagram'
                  ? igPosts.reduce((s, p) => s + (p.reach ?? 0), 0)
                  : fbPosts.reduce((s, p) => s + (p.reach ?? 0), 0)
              const avgReachPerPost =
                metrics.summary.posts_published > 0
                  ? Math.round(totalReachFromPosts / metrics.summary.posts_published)
                  : 0
              return (
                <div className="space-y-6">
                  {/* Post-level summary cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Avg engagement rate
                      </p>
                      <p className="text-2xl font-semibold text-gray-900 mt-1">
                        {metrics.summary.avg_engagement_rate}%
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        across {metrics.summary.posts_published} posts
                      </p>
                    </div>
                    {metrics.summary.avg_save_rate > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Avg save rate
                        </p>
                        <p className="text-2xl font-semibold text-gray-900 mt-1">
                          {metrics.summary.avg_save_rate}%
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">saves / reach per post</p>
                      </div>
                    )}
                    {metrics.summary.total_shares > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Total shares
                        </p>
                        <p className="text-2xl font-semibold text-gray-900 mt-1">
                          {metrics.summary.total_shares.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">in selected period</p>
                      </div>
                    )}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Total likes
                      </p>
                      <p className="text-2xl font-semibold text-gray-900 mt-1">
                        {totalLikes.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">in selected period</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Total comments
                      </p>
                      <p className="text-2xl font-semibold text-gray-900 mt-1">
                        {totalComments.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">in selected period</p>
                    </div>
                    {avgReachPerPost > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Avg reach per post
                        </p>
                        <p className="text-2xl font-semibold text-gray-900 mt-1">
                          {avgReachPerPost.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          across {metrics.summary.posts_published} posts
                        </p>
                      </div>
                    )}
                  </div>
                  <PostDayBreakdown metrics={metrics} />
                  <TopPostsTable metrics={metrics} limit={5} />
                  <PostGrid metrics={metrics} />
                </div>
              )
            })()}

          {/* Audience tab */}
          {activeTab === 'audience' && (
            <div className="space-y-6">
              <FollowerTrend metrics={metrics} />
              <AudienceSection metrics={metrics} />
            </div>
          )}
        </div>
      )}

      {/* Report history */}
      {selectedClientId && (
        <ReportHistory clientId={selectedClientId} platform={platform} onLoad={handleLoadReport} />
      )}
    </div>
  )
}

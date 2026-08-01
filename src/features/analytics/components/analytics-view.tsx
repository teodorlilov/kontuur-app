'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { HeaderMeta, MetaWarn, PageHeader } from '@/components/layout/page-header/page-header'
import { Segmented } from '@/components/layout/page-header/segmented'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import { ReportHistory } from './report-history'
import { AnalyticsLoading } from './analytics-loading'
import { EmptyStateAnalytics } from './empty-state-analytics'
import { OverviewTab } from './overview-tab'
import { PostsTab } from './posts-tab'
import { AudienceTab } from './audience-tab'
import { capitalizePlatform } from '../utils/metrics'
import type { AnalyticsReport, AnalyticsMetrics, MetaConnection } from '@/types/api'

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

/** Top-level analytics page. Owns the header: the report tabs are its state. */
export function AnalyticsView({ clients, initialConnections }: AnalyticsViewProps) {
  const router = useRouter()
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? '')
  // Platform type is only 'instagram' | 'facebook' in practice but the DB
  // column is a plain string, so we assert after reading from the connection.
  const [platform, setPlatform] = useState<'instagram' | 'facebook'>(
    (initialConnections[0]?.platform as 'instagram' | 'facebook') ?? 'instagram'
  )
  const [preset, setPreset] = useState<Preset>('30d')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [connections, setConnections] = useState<MetaConnection[]>(initialConnections)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<AnalyticsReport | null>(null)

  // Tracks the (clientId, platform) pair that ReportHistory should fetch for.
  // Updated atomically after connections resolve so ReportHistory never fires
  // with a mismatched pair.
  const [historyClientId, setHistoryClientId] = useState(clients[0]?.id ?? '')
  const [historyPlatform, setHistoryPlatform] = useState<'instagram' | 'facebook'>(
    (initialConnections[0]?.platform as 'instagram' | 'facebook') ?? 'instagram'
  )

  // Skip initial mount — connections for the first client are passed as props
  // from the server component, so no client-side fetch is needed on load.
  const isInitialMount = useRef(true)

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
          const resolvedPlatform = firstConn.platform as 'instagram' | 'facebook'
          setPlatform(resolvedPlatform)
          setHistoryClientId(selectedClientId)
          setHistoryPlatform(resolvedPlatform)
        } else {
          setHistoryClientId(selectedClientId)
        }
      })
      .catch(() => setConnections([]))
  }, [selectedClientId])

  const connectedPlatforms = useMemo(
    () => new Set(connections.map((c) => c.platform)),
    [connections]
  )
  const currentClientName = useMemo(
    () => clients.find((c) => c.id === selectedClientId)?.name ?? '',
    [clients, selectedClientId]
  )

  const handleGenerateReport = useCallback(async () => {
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
      if (!res.ok || !data.report) throw new Error(data.error ?? 'Failed to generate report')
      setReport(data.report)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }, [selectedClientId, platform, preset])

  const handleLoadReport = useCallback((loaded: AnalyticsReport) => {
    setReport(loaded)
    // DB stores platform as a plain string — assert to the known union
    setPlatform(loaded.platform as 'instagram' | 'facebook')
    setHistoryPlatform(loaded.platform as 'instagram' | 'facebook')
    setActiveTab('overview')
  }, [])

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">No clients yet. Add a client to get started.</p>
      </div>
    )
  }

  // metrics_json is stored as JSONB — the API guarantees the shape matches
  // AnalyticsMetrics but TypeScript sees it as Json, so we assert.
  const metrics = report?.metrics_json as AnalyticsMetrics | undefined

  const platformOptions = (['instagram', 'facebook'] as const)
    .filter((p) => connectedPlatforms.has(p))
    .map((p) => ({ value: p, label: capitalizePlatform(p) }))

  const reportTabs: Array<TabItem<Tab>> = [
    { id: 'overview', label: 'Overview' },
    { id: 'posts', label: 'Posts' },
    { id: 'audience', label: 'Audience' },
  ]

  const showTabs = !generating && !!report && !!metrics

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Analytics' }]}
        title="Analytics"
        railTools={
          report ? (
            <span className="hidden text-xs text-text3 sm:block">
              Updated {formatRelativeTime(new Date(report.created_at))}
            </span>
          ) : null
        }
        meta={
          <HeaderMeta
            parts={[
              currentClientName || null,
              connectedPlatforms.size > 0 ? capitalizePlatform(platform) : null,
              connectedPlatforms.size === 0 && <MetaWarn>No account connected</MetaWarn>,
            ]}
          />
        }
        actions={
          <>
            {clients.length > 1 && (
              <SelectControl
                label="Client"
                value={selectedClientId}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setSelectedClientId}
              />
            )}
            {platformOptions.length > 1 && (
              <SelectControl
                label="Platform"
                value={platform}
                options={platformOptions}
                onChange={(p) => {
                  setPlatform(p)
                  setHistoryPlatform(p)
                }}
              />
            )}
            <Segmented
              label="Report range"
              value={preset}
              options={[
                { value: '7d' as const, label: '7d' },
                { value: '30d' as const, label: '30d' },
                { value: '90d' as const, label: '90d' },
              ]}
              onChange={setPreset}
            />
            {report && (
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                Export PDF
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleGenerateReport}
              loading={generating}
              disabled={
                generating || connectedPlatforms.size === 0 || !connectedPlatforms.has(platform)
              }
            >
              {report ? 'Regenerate' : 'Generate report'}
            </Button>
          </>
        }
        // Only once a report exists — there is nothing to tab between before that.
        tabs={
          showTabs ? (
            <TabRail
              items={reportTabs}
              active={activeTab}
              onSelect={setActiveTab}
              label="Report sections"
            />
          ) : undefined
        }
      />

      <div className={cn(PAGE_SHELL, 'min-h-0 flex-1 space-y-6 overflow-y-auto pb-8 pt-6')}>
        {connectedPlatforms.size === 0 && !generating && (
          <EmptyStateAnalytics
            variant="no-accounts"
            clientName={currentClientName}
            onConnect={() => router.push(`/clients/${selectedClientId}/edit`)}
          />
        )}

        {connectedPlatforms.size > 0 && !generating && !report && (
          <EmptyStateAnalytics
            variant="ready"
            clientName={currentClientName}
            platform={platform}
            range={preset}
            onGenerate={handleGenerateReport}
          />
        )}

        {generating && (
          <AnalyticsLoading platform={platform} clientName={currentClientName} range={preset} />
        )}

        {!generating && report && metrics && (
          <div id="analytics-print-area" className="space-y-6">
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {currentClientName} — {capitalizePlatform(report.platform)} Report
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Period: {report.period_start} to {report.period_end}
              </p>
            </div>

            {activeTab === 'overview' && (
              <OverviewTab
                metrics={metrics}
                aiSummary={report.ai_summary}
                onViewAllPosts={() => setActiveTab('posts')}
              />
            )}
            {activeTab === 'posts' && <PostsTab metrics={metrics} aiSummary={report.ai_summary} />}
            {activeTab === 'audience' && <AudienceTab metrics={metrics} />}
          </div>
        )}

        {historyClientId && (
          <div className="print-hide">
            <ReportHistory
              clientId={historyClientId}
              platform={historyPlatform}
              onLoad={handleLoadReport}
            />
          </div>
        )}
      </div>
    </div>
  )
}

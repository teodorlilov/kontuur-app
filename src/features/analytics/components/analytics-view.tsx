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
import type { AnalyticsReport, MetaConnection } from '@/types/api'

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

/** Whether the client has an Instagram row — 'canva' rows share the table and don't count. */
function hasInstagramConnection(connections: MetaConnection[]): boolean {
  return connections.some((c) => c.platform === 'instagram')
}

/** Top-level analytics page. Owns the header: the report tabs are its state. */
export function AnalyticsView({ clients, initialConnections }: AnalyticsViewProps) {
  const router = useRouter()
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? '')
  const [preset, setPreset] = useState<Preset>('30d')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [connections, setConnections] = useState<MetaConnection[]>(initialConnections)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<AnalyticsReport | null>(null)

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
        setConnections(data.connections ?? [])
      })
      .catch(() => setConnections([]))
  }, [selectedClientId])

  const connected = hasInstagramConnection(connections)
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
          platform: 'instagram',
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
  }, [selectedClientId, preset])

  const handleLoadReport = useCallback((loaded: AnalyticsReport) => {
    setReport(loaded)
    setActiveTab('overview')
  }, [])

  if (clients.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-line p-8 text-center">
        <p className="text-body text-text3">No clients yet. Add a client to get started.</p>
      </div>
    )
  }

  const metrics = report?.metrics_json

  const reportTabs: Array<TabItem<Tab>> = [
    { id: 'overview', label: 'Overview' },
    { id: 'posts', label: 'Posts' },
    { id: 'audience', label: 'Audience' },
  ]

  const showTabs = !generating && !!report && !!metrics

  // No scroll container of its own — see settings-view. StickyShell's sentinel has
  // to leave the intersection of the page's real scroller, and an overflow-hidden
  // flex root with a scrolling child kept it permanently in view.
  return (
    <>
      <PageHeader
        crumb={[{ label: 'Analytics' }]}
        title="Analytics"
        railTools={
          report ? (
            <span className="hidden text-caption text-text3 sm:block">
              Updated {formatRelativeTime(new Date(report.created_at))}
            </span>
          ) : null
        }
        meta={
          <HeaderMeta
            parts={[
              currentClientName || null,
              connected ? 'Instagram' : null,
              !connected && <MetaWarn>No account connected</MetaWarn>,
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
              disabled={generating || !connected}
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

      <div className={cn(PAGE_SHELL, 'space-y-6 pb-8 pt-6')}>
        {!connected && !generating && (
          <EmptyStateAnalytics
            variant="no-accounts"
            clientName={currentClientName}
            onConnect={() => router.push(`/clients/${selectedClientId}/edit`)}
          />
        )}

        {connected && !generating && !report && (
          <EmptyStateAnalytics
            variant="ready"
            clientName={currentClientName}
            range={preset}
            onGenerate={handleGenerateReport}
          />
        )}

        {generating && <AnalyticsLoading clientName={currentClientName} range={preset} />}

        {!generating && report && metrics && (
          <div id="analytics-print-area" className="space-y-6">
            <div className="hidden print:block mb-6">
              <h1 className="text-headline font-semibold text-ink">
                {currentClientName} — Instagram Report
              </h1>
              <p className="text-body text-text3 mt-1">
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

        {selectedClientId && (
          <div className="print-hide">
            <ReportHistory clientId={selectedClientId} onLoad={handleLoadReport} />
          </div>
        )}
      </div>
    </>
  )
}

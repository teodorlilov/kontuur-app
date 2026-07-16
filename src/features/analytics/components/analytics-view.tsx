'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ReportHistory } from './report-history'
import { AnalyticsLoading } from './analytics-loading'
import { EmptyStateAnalytics } from './empty-state-analytics'
import { OverviewTab } from './overview-tab'
import { PostsTab } from './posts-tab'
import { AudienceTab } from './audience-tab'
import { capitalize } from '@/utils/format'
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

/** Top-level analytics page: controls bar, tab bar, and report content. */
export function AnalyticsView({ clients, initialConnections }: AnalyticsViewProps) {
  const router = useRouter()
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? '')
  // Platform type is only 'instagram' | 'facebook' in practice but the DB
  // column is a plain string, so we assert after reading from the connection.
  const [platform, setPlatform] = useState<'instagram' | 'facebook'>(
    (initialConnections[0]?.platform as 'instagram' | 'facebook') ?? 'instagram',
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
    (initialConnections[0]?.platform as 'instagram' | 'facebook') ?? 'instagram',
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

  const connectedPlatforms = useMemo(() => new Set(connections.map((c) => c.platform)), [connections])
  const currentClientName = useMemo(() => clients.find((c) => c.id === selectedClientId)?.name ?? '', [clients, selectedClientId])

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
        body: JSON.stringify({ client_id: selectedClientId, platform, period_start: start, period_end: end }),
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

  return (
    <div style={{ overflow: 'hidden' }}>
      <ControlsBar
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        connectedPlatforms={connectedPlatforms}
        platform={platform}
        onSelectPlatform={(p) => { setPlatform(p); setHistoryPlatform(p) }}
        preset={preset}
        onSelectPreset={setPreset}
        generating={generating}
        hasReport={!!report}
        onGenerate={handleGenerateReport}
        onExportPDF={() => { if (report) window.print() }}
      />

      {/* Tab bar — visible only when a report is loaded */}
      {!generating && report && metrics && (
        <TabBar activeTab={activeTab} onSelectTab={setActiveTab} />
      )}

      <div className="p-6 space-y-6">
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
                {currentClientName} — {capitalize(report.platform)} Report
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Period: {report.period_start} to {report.period_end}
              </p>
            </div>

            {activeTab === 'overview' && (
              <OverviewTab metrics={metrics} aiSummary={report.ai_summary} onViewAllPosts={() => setActiveTab('posts')} />
            )}
            {activeTab === 'posts' && <PostsTab metrics={metrics} aiSummary={report.ai_summary} />}
            {activeTab === 'audience' && <AudienceTab metrics={metrics} />}
          </div>
        )}

        {historyClientId && (
          <div className="print-hide">
            <ReportHistory clientId={historyClientId} platform={historyPlatform} onLoad={handleLoadReport} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components (only used by AnalyticsView) ────────────────────────── */

interface ControlsBarProps {
  clients: Array<{ id: string; name: string }>
  selectedClientId: string
  onSelectClient: (id: string) => void
  connectedPlatforms: Set<string>
  platform: 'instagram' | 'facebook'
  onSelectPlatform: (p: 'instagram' | 'facebook') => void
  preset: Preset
  onSelectPreset: (p: Preset) => void
  generating: boolean
  hasReport: boolean
  onGenerate: () => void
  onExportPDF: () => void
}

function ControlsBar({
  clients, selectedClientId, onSelectClient,
  connectedPlatforms, platform, onSelectPlatform,
  preset, onSelectPreset,
  generating, hasReport, onGenerate, onExportPDF,
}: ControlsBarProps) {
  return (
    <div
      className="print-hide pl-14 md:pl-[22px] pr-[22px]"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        minHeight: 52,
        paddingTop: 8,
        paddingBottom: 8,
        background: '#fff',
        borderBottom: '0.5px solid var(--color-border-1)',
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
        flexShrink: 0,
      }}
    >
      {clients.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 0' }} className="max-w-full md:max-w-none md:flex-none">
          <span className="hidden md:inline" style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', letterSpacing: '1.1px', textTransform: 'uppercase' as const }}>
            CLIENT
          </span>
          <select
            value={selectedClientId}
            onChange={(e) => onSelectClient(e.target.value)}
            style={{
              padding: '7px 12px',
              border: '0.5px solid var(--color-border-2)',
              borderRadius: 7,
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 500,
              color: 'var(--color-text-1)',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer',
              minWidth: 0,
              maxWidth: '100%',
              textOverflow: 'ellipsis',
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {connectedPlatforms.size > 0 && (
        <PillGroup
          items={(['instagram', 'facebook'] as const).filter((p) => connectedPlatforms.has(p))}
          active={platform}
          onSelect={onSelectPlatform}
          label={(p) => (p === 'instagram' ? 'Instagram' : 'Facebook')}
        />
      )}

      <PillGroup
        items={['7d', '30d', '90d'] as Preset[]}
        active={preset}
        onSelect={onSelectPreset}
        label={(p) => p}
      />

      <div className="ml-0 md:ml-auto" style={{ display: 'flex', gap: 8 }}>
        <Button
          onClick={onGenerate}
          loading={generating}
          disabled={generating || connectedPlatforms.size === 0 || !connectedPlatforms.has(platform)}
        >
          {hasReport ? 'Regenerate' : 'Generate report'}
        </Button>
        {hasReport && (
          <Button variant="ghost" onClick={onExportPDF}>
            Export PDF
          </Button>
        )}
      </div>
    </div>
  )
}

function PillGroup<T extends string>({
  items, active, onSelect, label,
}: {
  items: T[]
  active: T
  onSelect: (item: T) => void
  label: (item: T) => string
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {items.map((item) => {
        const isActive = active === item
        return (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            style={{
              padding: '6px 14px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 500,
              border: '0.5px solid',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              background: isActive ? 'var(--color-brand)' : '#fff',
              color: isActive ? '#fff' : 'var(--color-muted)',
              borderColor: isActive ? 'var(--color-brand)' : 'var(--color-border-2)',
            }}
          >
            {label(item)}
          </button>
        )
      })}
    </div>
  )
}

function TabBar({ activeTab, onSelectTab }: { activeTab: Tab; onSelectTab: (t: Tab) => void }) {
  return (
    <div
      className="print-hide"
      style={{
        display: 'flex',
        gap: 4,
        padding: '0 22px',
        background: '#fff',
        borderBottom: '0.5px solid var(--color-border-1)',
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      {(['overview', 'posts', 'audience'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelectTab(tab)}
          className="text-sm font-medium capitalize transition-colors"
          style={{
            padding: '12px 16px',
            marginBottom: -0.5,
            background: 'none',
            border: 'none',
            borderBottomStyle: 'solid',
            borderBottomWidth: 2,
            borderBottomColor: activeTab === tab ? 'var(--color-terracotta)' : 'transparent',
            color: activeTab === tab ? 'var(--color-text-1)' : 'var(--color-text-3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

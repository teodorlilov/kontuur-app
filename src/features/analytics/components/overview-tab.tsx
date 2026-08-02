'use client'

import dynamic from 'next/dynamic'
import type { AnalyticsMetrics } from '@/types/api'
import { AiSummaryStrip } from './ai-summary-strip'
import { MetricCards } from './metric-cards'
import { MediaTypeBreakdown } from './media-type-breakdown'
import { TopPostsTable } from './top-posts-table'

// Lazy through the shared './charts' boundary — keeps recharts out of the route's initial JS.
const AnalyticsCharts = dynamic(() => import('./charts').then((m) => m.AnalyticsCharts))

interface OverviewTabProps {
  metrics: AnalyticsMetrics
  aiSummary: string
  onViewAllPosts: () => void
}

/** Overview tab — AI summary, metric cards, charts, media breakdown, top posts preview. */
export function OverviewTab({ metrics, aiSummary, onViewAllPosts }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <AiSummaryStrip summary={aiSummary} />
      <MetricCards metrics={metrics} />
      <AnalyticsCharts metrics={metrics} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MediaTypeBreakdown metrics={metrics} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>Top posts by reach</p>
            <button
              type="button"
              onClick={onViewAllPosts}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--spring-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              See all →
            </button>
          </div>
          <TopPostsTable metrics={metrics} limit={3} />
        </div>
      </div>
    </div>
  )
}

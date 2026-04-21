'use client'

import { PanelHeader } from './basic-info-tab'

export interface ContentInsights {
  avgScore: number | null
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  topApprovedPillars: string[]
  topRewritePillars: string[]
}

interface ContentInsightsTabProps {
  insights: ContentInsights | null
  sourceCount: number
  clientId: string
}

/** Content insights tab: read-only stats from approved and published posts. */
export function ContentInsightsTab({ insights, sourceCount, clientId }: ContentInsightsTabProps) {
  return (
    <>
      <PanelHeader
        title="Content insights"
        subtitle="Performance patterns from approved and published posts"
      />
      <div style={{ padding: '20px 22px' }}>
        {!insights ? (
          <EmptyState text="Not enough data to show insights yet. Approve and publish posts to see patterns here." />
        ) : (
          <>
            {insights.avgScore !== null && <ScoreSection insights={insights} />}
            <PillarSection label="Top approved pillars" pillars={insights.topApprovedPillars} />
            <PillarSection label="Most rewritten pillars" pillars={insights.topRewritePillars} />
          </>
        )}

        <SourceUsageSection sourceCount={sourceCount} clientId={clientId} />
      </div>
    </>
  )
}

function ScoreSection({ insights }: { insights: ContentInsights }) {
  const trendLabel =
    insights.trend === 'improving'
      ? '↑ improving'
      : insights.trend === 'declining'
        ? '↓ declining'
        : insights.trend === 'stable'
          ? '→ stable'
          : null

  const trendColor =
    insights.trend === 'improving'
      ? 'var(--color-published-fg)'
      : insights.trend === 'declining'
        ? 'var(--color-error-fg)'
        : 'var(--color-text-3)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
        padding: '14px 16px',
        background: 'var(--color-sunken)',
        borderRadius: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--color-text-1)' }}>
          {insights.avgScore}/10
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Avg quality score</div>
      </div>
      {trendLabel && (
        <span style={{ fontSize: 12, color: trendColor, marginLeft: 8 }}>{trendLabel}</span>
      )}
    </div>
  )
}

function PillarSection({ label, pillars }: { label: string; pillars: string[] }) {
  if (pillars.length === 0) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pillars.map((pillar) => (
          <span
            key={pillar}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: 'var(--color-sunken)',
              borderRadius: 6,
              color: 'var(--color-text-1)',
            }}
          >
            {pillar}
          </span>
        ))}
      </div>
    </div>
  )
}

function SourceUsageSection({ sourceCount, clientId }: { sourceCount: number; clientId: string }) {
  return (
    <div
      style={{
        borderTop: '0.5px solid var(--color-border-1)',
        paddingTop: 16,
        marginTop: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Research sources
      </div>
      {sourceCount === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-3)', lineHeight: 1.7 }}>
          No sources configured.{' '}
          <a
            href={`/clients/${clientId}/sources`}
            style={{ color: 'var(--color-terracotta)', textDecoration: 'none' }}
          >
            Add RSS feeds or website URLs
          </a>{' '}
          to ground research in real content.
        </p>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>
            {sourceCount} active source{sourceCount !== 1 ? 's' : ''}
          </strong>{' '}
          configured.{' '}
          <a
            href={`/clients/${clientId}/sources`}
            style={{ color: 'var(--color-terracotta)', textDecoration: 'none' }}
          >
            Manage →
          </a>
        </p>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--color-text-3)',
        lineHeight: 1.7,
      }}
    >
      {text}
    </div>
  )
}

'use client'

import { AlertTriangle, BarChart3 } from 'lucide-react'
import { capitalizePlatform } from '../utils/metrics'

interface EmptyStateAnalyticsProps {
  variant: 'no-accounts' | 'ready'
  clientName: string
  platform?: string
  range?: string
  followerCount?: number
  onConnect?: () => void
  onGenerate?: () => void
}

/** Empty state for analytics — no-accounts or ready-to-generate. */
export function EmptyStateAnalytics({
  variant,
  clientName,
  platform,
  range,
  followerCount,
  onConnect,
  onGenerate,
}: EmptyStateAnalyticsProps) {
  const isTerra = variant === 'ready'

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-page)',
        padding: '40px 20px',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <IconFrame terra={isTerra}>
        {isTerra ? (
          <BarChart3 size={22} color="var(--color-terracotta)" strokeWidth={1.5} />
        ) : (
          <AlertTriangle size={22} color="rgba(44,62,80,0.22)" strokeWidth={1.5} />
        )}
      </IconFrame>

      <h2
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 22,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        {isTerra ? 'Ready to generate' : 'No accounts connected'}
      </h2>

      <p
        style={{
          fontSize: 13,
          color: 'var(--color-muted)',
          lineHeight: 1.65,
          textAlign: 'center',
          maxWidth: 380,
          marginBottom: 26,
        }}
      >
        {isTerra
          ? `${platform ? capitalizePlatform(platform) : 'Platform'} is connected for ${clientName}. Choose a time range and generate a performance report for the last ${range ?? '30 days'}.`
          : `Connect an Instagram or Facebook account for ${clientName} to start generating analytics reports.`}
      </p>

      {isTerra ? (
        <button
          type="button"
          onClick={onGenerate}
          style={{
            padding: '10px 24px',
            background: 'var(--color-terracotta)',
            color: '#fff',
            border: 'none',
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Generate {range ?? '30d'} report →
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          style={{
            padding: '10px 24px',
            background: 'var(--sidebar-bg)',
            color: 'var(--sidebar-text-active)',
            border: 'none',
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Connect Instagram or Facebook →
        </button>
      )}

      {isTerra && platform && followerCount != null && (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 14 }}>
          {clientName} · {capitalizePlatform(platform)} · {followerCount.toLocaleString()} followers
        </p>
      )}
    </div>
  )
}

function IconFrame({ terra, children }: { terra: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderLeft: `1.5px solid ${terra ? 'rgba(192,123,85,0.35)' : 'rgba(44,62,80,0.18)'}`,
        borderRight: `1.5px solid ${terra ? 'rgba(192,123,85,0.35)' : 'rgba(44,62,80,0.18)'}`,
        borderTop: `0.5px solid ${terra ? 'rgba(192,123,85,0.15)' : 'rgba(44,62,80,0.09)'}`,
        borderBottom: `0.5px solid ${terra ? 'rgba(192,123,85,0.15)' : 'rgba(44,62,80,0.09)'}`,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  )
}

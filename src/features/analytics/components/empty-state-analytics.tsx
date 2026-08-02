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
        background: 'var(--paper)',
        padding: '40px 20px',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <IconFrame terra={isTerra}>
        {isTerra ? (
          <BarChart3 size={22} color="var(--spring)" strokeWidth={1.5} />
        ) : (
          <AlertTriangle size={22} color="rgba(15,21,18,0.22)" strokeWidth={1.5} />
        )}
      </IconFrame>

      <h2
        className="text-headline"
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontWeight: 400,
          color: 'var(--ink)',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        {isTerra ? 'Ready to generate' : 'No accounts connected'}
      </h2>

      <p
        className="text-body"
        style={{
          color: 'var(--text2)',
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
          className="text-body"
          style={{
            padding: '10px 24px',
            background: 'var(--spring)',
            color: '#fff',
            border: 'none',
            borderRadius: 9,
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
          className="text-body"
          style={{
            padding: '10px 24px',
            background: 'var(--forest-deep)',
            color: '#f2f5f1',
            border: 'none',
            borderRadius: 9,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Connect Instagram or Facebook →
        </button>
      )}

      {isTerra && platform && followerCount != null && (
        <p className="text-caption text-text2" style={{ marginTop: 14 }}>
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
        borderLeft: `1.5px solid ${terra ? 'rgba(46,158,104,0.35)' : 'rgba(15,21,18,0.18)'}`,
        borderRight: `1.5px solid ${terra ? 'rgba(46,158,104,0.35)' : 'rgba(15,21,18,0.18)'}`,
        borderTop: `1px solid ${terra ? 'rgba(46,158,104,0.15)' : 'rgba(15,21,18,0.09)'}`,
        borderBottom: `1px solid ${terra ? 'rgba(46,158,104,0.15)' : 'rgba(15,21,18,0.09)'}`,
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

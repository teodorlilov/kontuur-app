'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { capitalize } from '@/utils/format'

interface AnalyticsLoadingProps {
  platform: string
  clientName: string
  range: string
}

const STAGE_DURATIONS = [2000, 4000, 5000, 8000]

function buildStageLabels(platform: string): string[] {
  const name = capitalize(platform)
  return [
    `Connected to ${name} API`,
    'Fetching post metrics',
    'Fetching audience data',
    'Generating AI summary',
  ]
}

/** 4-stage cosmetic loading view for report generation. */
/** 4-stage cosmetic loading view for report generation. */
export function AnalyticsLoading({ platform, clientName, range }: AnalyticsLoadingProps) {
  const [stage, setStage] = useState(0)
  const labels = buildStageLabels(platform)

  useEffect(() => {
    if (stage >= labels.length - 1) return
    const timer = setTimeout(() => setStage((s) => s + 1), STAGE_DURATIONS[stage])
    return () => clearTimeout(timer)
  }, [stage, labels.length])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '0.5px solid var(--color-border-1)',
      }}
    >
      <FrameIcon />

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          textAlign: 'center',
          marginBottom: 5,
        }}
      >
        Building your report
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', marginBottom: 28 }}>
        {clientName} · {capitalize(platform)} · Last {range}
      </p>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {labels.map((label, i) => (
          <StageRow key={i} isDone={i < stage} isActive={i === stage} label={label} />
        ))}
      </div>

    </div>
  )
}

function FrameIcon() {
  return (
    <div
      style={{
        borderLeft: '2px solid var(--color-terracotta)',
        borderRight: '2px solid var(--color-terracotta)',
        borderTop: '0.5px solid var(--color-border-2)',
        borderBottom: '0.5px solid var(--color-border-2)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
      }}
    >
      <BarChart3 size={22} color="var(--color-terracotta)" strokeWidth={1.5} />
    </div>
  )
}

function StageRow({ isDone, isActive, label }: { isDone: boolean; isActive: boolean; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: isDone ? 'rgba(122,154,106,0.08)' : isActive ? 'rgba(44,62,80,0.06)' : 'var(--color-page)',
        transition: 'background 0.3s',
      }}
    >
      <StageIcon isDone={isDone} isActive={isActive} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: isDone ? 'var(--status-ok)' : isActive ? 'var(--color-text-1)' : 'var(--color-muted)',
        }}
      >
        {label}
      </span>
    </div>
  )
}

function StageIcon({ isDone, isActive }: { isDone: boolean; isActive: boolean }) {
  const base: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  if (isDone) {
    return (
      <div style={{ ...base, background: 'var(--status-ok)' }}>
        <Check size={10} color="#fff" strokeWidth={2.5} />
      </div>
    )
  }

  if (isActive) {
    return (
      <div style={{ ...base, background: 'var(--sidebar-bg)' }}>
        <Spinner size="sm" className="!h-[10px] !w-[10px]" />
      </div>
    )
  }

  return <div style={{ ...base, background: 'rgba(44,62,80,0.12)' }} />
}

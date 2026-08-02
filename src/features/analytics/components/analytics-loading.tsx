'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { capitalizePlatform } from '../utils/metrics'

interface AnalyticsLoadingProps {
  platform: string
  clientName: string
  range: string
}

const STAGE_DURATIONS = [2000, 4000, 5000, 8000]

function buildStageLabels(platform: string): string[] {
  const name = capitalizePlatform(platform)
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
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line)',
      }}
    >
      <FrameIcon />

      <h2
        className="text-headline"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          color: 'var(--ink)',
          textAlign: 'center',
          marginBottom: 5,
        }}
      >
        Building your report
      </h2>
      <p className="text-body text-text2" style={{ textAlign: 'center', marginBottom: 28 }}>
        {clientName} · {capitalizePlatform(platform)} · Last {range}
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginBottom: 24,
        }}
      >
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
        borderLeft: '2px solid var(--spring)',
        borderRight: '2px solid var(--spring)',
        borderTop: '1px solid var(--line2)',
        borderBottom: '1px solid var(--line2)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
      }}
    >
      <BarChart3 size={22} color="var(--spring)" strokeWidth={1.5} />
    </div>
  )
}

function StageRow({
  isDone,
  isActive,
  label,
}: {
  isDone: boolean
  isActive: boolean
  label: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: isDone ? 'var(--wash)' : isActive ? 'rgba(15,21,18,0.06)' : 'var(--paper)',
        transition: 'background 0.3s',
      }}
    >
      <StageIcon isDone={isDone} isActive={isActive} />
      <span
        className="text-caption"
        style={{
          fontWeight: 500,
          color: isDone ? 'var(--spring-text)' : isActive ? 'var(--ink)' : 'var(--text2)',
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
      <div style={{ ...base, background: 'var(--spring)' }}>
        <Check size={10} color="#fff" strokeWidth={2.5} />
      </div>
    )
  }

  if (isActive) {
    return (
      <div style={{ ...base, background: 'var(--forest-deep)' }}>
        <Spinner size="sm" className="!h-[10px] !w-[10px]" />
      </div>
    )
  }

  return <div style={{ ...base, background: 'rgba(15,21,18,0.12)' }} />
}

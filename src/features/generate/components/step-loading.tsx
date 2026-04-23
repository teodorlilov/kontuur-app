'use client'

import { Pencil, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

const STAGE_LABELS = [
  'Fetching sources',
  'Researching content',
  'Writing captions and carousel slides',
  'Quality validation',
]

interface StepLoadingProps {
  clientName: string
  stage: number
  streamTotal: number
  generatedCount: number
  researchPhase: string
}

/** Step 4: centered loading view with 4 named stages. */
export function StepLoading({ clientName, stage, streamTotal, generatedCount, researchPhase }: StepLoadingProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: 'var(--color-surface)',
      }}
    >
      <FrameIcon />

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--color-text-1)',
          textAlign: 'center',
          marginBottom: '5px',
        }}
      >
        Generating posts for {clientName}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', marginBottom: '28px' }}>
        Fetching sources, researching content, writing captions
      </p>

      <StageList stage={stage} researchPhase={researchPhase} />

      {streamTotal > 0 && <ProgressBar current={generatedCount} total={streamTotal} />}

      <SkeletonCard />
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
        marginBottom: '20px',
      }}
    >
      <Pencil size={22} color="var(--color-terracotta)" strokeWidth={1.5} />
    </div>
  )
}

function StageList({ stage, researchPhase }: { stage: number; researchPhase: string }) {
  return (
    <div style={{ width: '100%', maxWidth: '320px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {STAGE_LABELS.map((label, i) => {
        const isDone = i < stage
        const isActive = i === stage
        const displayLabel = isActive && researchPhase ? researchPhase : label
        return <StageRow key={i} isDone={isDone} isActive={isActive} label={displayLabel} />
      })}
    </div>
  )
}

function StageRow({ isDone, isActive, label }: { isDone: boolean; isActive: boolean; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: isDone ? 'rgba(90,138,74,0.07)' : isActive ? 'rgba(44,62,80,0.06)' : 'var(--color-page)',
        transition: 'background 0.3s',
      }}
    >
      <StageIcon isDone={isDone} isActive={isActive} />
      <span
        style={{
          fontSize: '12px',
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
  if (isDone) {
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'var(--status-ok)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Check size={10} color="#fff" strokeWidth={2.5} />
      </div>
    )
  }

  if (isActive) {
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'var(--sidebar-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Spinner size="sm" className="!h-[10px] !w-[10px]" />
      </div>
    )
  }

  return (
    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(44,62,80,0.12)', flexShrink: 0 }} />
  )
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ width: '100%', maxWidth: '320px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-muted)', marginBottom: '6px' }}>
        <span>Generating posts...</span>
        <span>{current} of {total} complete</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(44,62,80,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'var(--color-terracotta)',
            width: `${percent}%`,
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '320px',
        background: 'var(--color-page)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <SkeletonLine width="60%" />
      <SkeletonLine width="100%" />
      <SkeletonLine width="90%" />
      <SkeletonLine width="75%" />
    </div>
  )
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      style={{
        height: '10px',
        borderRadius: '4px',
        background: 'rgba(44,62,80,0.08)',
        width,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

/** Maps streaming phase strings to discrete stage indices (0-3). */
export function mapPhaseToStage(phase: string): number {
  const lower = phase.toLowerCase()
  if (lower.includes('quality') || lower.includes('validat') || lower.includes('check')) return 3
  if (lower.includes('generat') || lower.includes('writ') || lower.includes('caption')) return 2
  if (lower.includes('pillar') || lower.includes('research') || lower.includes('theme') || lower.includes('analyz')) return 1
  return 0
}

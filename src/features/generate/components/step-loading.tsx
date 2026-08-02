'use client'

import { Pencil, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

const STAGE_LABELS = [
  'Fetching sources',
  'Researching content',
  'Writing captions and carousel slides',
  'Quality validation',
]

const IDEA_STAGE_LABELS = [
  'Searching for sources',
  'Enriching idea',
  'Writing post',
  'Quality validation',
]

interface StepLoadingProps {
  clientName: string
  stage: number
  streamTotal: number
  generatedCount: number
  researchPhase: string
  isIdeaFlow?: boolean
}

/** Step 4: centered loading view with 4 named stages. */
export function StepLoading({ clientName, stage, streamTotal, generatedCount, researchPhase, isIdeaFlow }: StepLoadingProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: 'var(--surface)',
      }}
    >
      <FrameIcon />

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--ink)',
          textAlign: 'center',
          marginBottom: '5px',
        }}
      >
        {isIdeaFlow ? `Generating post for ${clientName}` : `Generating posts for ${clientName}`}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text2)', textAlign: 'center', marginBottom: '28px' }}>
        {isIdeaFlow ? 'Searching sources, enriching idea, writing post' : 'Fetching sources, researching content, writing captions'}
      </p>

      <StageList stage={stage} researchPhase={researchPhase} labels={isIdeaFlow ? IDEA_STAGE_LABELS : STAGE_LABELS} />

      {streamTotal > 0 && <ProgressBar current={generatedCount} total={streamTotal} />}

      <SkeletonCard />
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
        marginBottom: '20px',
      }}
    >
      <Pencil size={22} color="var(--spring)" strokeWidth={1.5} />
    </div>
  )
}

function StageList({ stage, researchPhase, labels }: { stage: number; researchPhase: string; labels: string[] }) {
  return (
    <div style={{ width: '100%', maxWidth: '320px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {labels.map((label, i) => {
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
        background: isDone ? 'rgba(46,158,104,0.07)' : isActive ? 'rgba(15,21,18,0.06)' : 'var(--paper)',
        transition: 'background 0.3s',
      }}
    >
      <StageIcon isDone={isDone} isActive={isActive} />
      <span
        style={{
          fontSize: '12px',
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
  if (isDone) {
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'var(--spring)',
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
          background: 'var(--forest-deep)',
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
    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(15,21,18,0.12)', flexShrink: 0 }} />
  )
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ width: '100%', maxWidth: '320px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>
        <span>Generating posts...</span>
        <span>{current} of {total} complete</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(15,21,18,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'var(--spring)',
            // scaleX, not width — animating width lays out every frame.
            width: '100%',
            transformOrigin: 'left',
            transform: `scaleX(${percent / 100})`,
            transition: 'transform 0.5s var(--ease-contour)',
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
        background: 'var(--paper)',
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
        background: 'rgba(15,21,18,0.08)',
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

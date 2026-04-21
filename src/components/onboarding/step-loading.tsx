'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

interface StepLoadingProps {
  analysisComplete: boolean
  onSkip: () => void
  onComplete: () => void
}

const STAGES = [
  'Fetching website content',
  'Detecting brand voice and tone',
  'Identifying content pillars',
  'Building client profile',
]

const STAGE_INTERVAL_MS = 2000

/** Step 2: analysis progress animation with four named stages. */
export function StepLoading({ analysisComplete, onSkip, onComplete }: StepLoadingProps) {
  const [activeStage, setActiveStage] = useState(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Advance stages on a timer
  useEffect(() => {
    if (analysisComplete) return
    if (activeStage >= STAGES.length - 1) return
    const timer = setTimeout(() => setActiveStage((s) => s + 1), STAGE_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [activeStage, analysisComplete])

  // When analysis completes, fast-forward and transition
  const handleComplete = useCallback(() => {
    onCompleteRef.current()
  }, [])

  useEffect(() => {
    if (!analysisComplete) return
    setActiveStage(STAGES.length)
    const timer = setTimeout(handleComplete, 500)
    return () => clearTimeout(timer)
  }, [analysisComplete, handleComplete])

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
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: 'var(--sidebar-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <Search size={22} color="var(--color-terracotta)" strokeWidth={1.5} />
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: '6px',
          textAlign: 'center',
        }}
      >
        Analyzing brand presence
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', marginBottom: '32px' }}>
        Scanning website, detecting tone and content themes
      </p>

      <StageList activeStage={activeStage} />

      <button
        type="button"
        onClick={onSkip}
        style={{
          fontSize: '12px',
          color: 'var(--color-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Skip to interview →
      </button>
    </div>
  )
}

function StageList({ activeStage }: { activeStage: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        maxWidth: '340px',
        marginBottom: '28px',
      }}
    >
      {STAGES.map((label, i) => (
        <StageRow key={label} label={label} index={i} activeStage={activeStage} />
      ))}
    </div>
  )
}

function StageRow({ label, index, activeStage }: { label: string; index: number; activeStage: number }) {
  const isDone = index < activeStage
  const isActive = index === activeStage

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: isDone
          ? 'rgba(122,154,106,0.08)'
          : isActive
            ? 'rgba(44,62,80,0.06)'
            : 'var(--color-page)',
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
    <div
      style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: 'rgba(44,62,80,0.12)',
        flexShrink: 0,
      }}
    />
  )
}

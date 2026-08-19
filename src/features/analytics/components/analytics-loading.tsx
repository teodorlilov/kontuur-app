'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/utils/cn'

interface AnalyticsLoadingProps {
  clientName: string
  range: string
}

const STAGE_DURATIONS = [2000, 4000, 5000, 8000]

const STAGE_LABELS = [
  'Connected to Instagram API',
  'Fetching post metrics',
  'Fetching audience data',
  'Generating AI summary',
]

/** 4-stage cosmetic loading view for report generation. */
export function AnalyticsLoading({ clientName, range }: AnalyticsLoadingProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (stage >= STAGE_LABELS.length - 1) return
    const timer = setTimeout(() => setStage((s) => s + 1), STAGE_DURATIONS[stage])
    return () => clearTimeout(timer)
  }, [stage])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-surface rounded-lg border border-line">
      <FrameIcon />

      <h2 className="text-headline font-display font-normal text-ink text-center mb-[5px]">
        Building your report
      </h2>
      <p className="text-body text-text2 text-center mb-7">
        {clientName} · Instagram · Last {range}
      </p>

      <div className="w-full max-w-[320px] flex flex-col gap-1.5 mb-6">
        {STAGE_LABELS.map((label, i) => (
          <StageRow key={i} isDone={i < stage} isActive={i === stage} label={label} />
        ))}
      </div>
    </div>
  )
}

function FrameIcon() {
  return (
    <div className="border-x-2 border-x-spring border-y border-y-line2 px-4 py-3.5 flex items-center justify-center mb-5">
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
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-2.5 rounded-sm',
        isDone ? 'bg-wash' : isActive ? 'bg-ink/6' : 'bg-paper'
      )}
      style={{ transition: 'background 0.3s' }}
    >
      <StageIcon isDone={isDone} isActive={isActive} />
      <span
        className={cn(
          'text-caption font-medium',
          isDone ? 'text-spring-text' : isActive ? 'text-ink' : 'text-text2'
        )}
      >
        {label}
      </span>
    </div>
  )
}

const STAGE_ICON_BASE = 'w-5 h-5 rounded-full flex items-center justify-center shrink-0'

function StageIcon({ isDone, isActive }: { isDone: boolean; isActive: boolean }) {
  if (isDone) {
    return (
      <div className={cn(STAGE_ICON_BASE, 'bg-spring')}>
        <Check size={10} color="#fff" strokeWidth={2.5} />
      </div>
    )
  }

  if (isActive) {
    return (
      <div className={cn(STAGE_ICON_BASE, 'bg-forest-deep')}>
        <Spinner size="sm" className="!h-[10px] !w-[10px]" />
      </div>
    )
  }

  return <div className={cn(STAGE_ICON_BASE, 'bg-ink/12')} />
}

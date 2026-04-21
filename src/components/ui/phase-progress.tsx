'use client'

import { useState, useEffect } from 'react'
import { Spinner } from '@/components/ui/spinner'

export interface Phase {
  message: string
  duration: number
}

interface PhaseProgressProps {
  phases: Phase[]
  subtitle?: string
}

export function PhaseProgress({ phases, subtitle }: PhaseProgressProps) {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    if (phaseIndex >= phases.length - 1) return

    const timer = setTimeout(() => {
      setPhaseIndex((i) => Math.min(i + 1, phases.length - 1))
    }, phases[phaseIndex]!.duration)

    return () => clearTimeout(timer)
  }, [phaseIndex, phases])

  const current = phases[phaseIndex]!
  const progress = Math.round(((phaseIndex + 1) / phases.length) * 100)

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <Spinner size="lg" />

      <div className="flex flex-col items-center gap-2 min-h-[3rem]">
        <p className="text-sm font-medium text-gray-700 transition-opacity duration-300">
          {current.message}
        </p>
      </div>

      <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ background: 'var(--color-brand)', width: `${progress}%` }}
        />
      </div>

      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  )
}

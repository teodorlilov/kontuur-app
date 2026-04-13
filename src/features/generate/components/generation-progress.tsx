'use client'

import { PhaseProgress, type Phase } from '@/components/ui/phase-progress'

interface GenerationProgressProps {
  total: number
  postType: 'single' | 'carousel'
}

const STATIC_PHASES: Phase[] = [
  { message: 'Loading brand profile and language rules...', duration: 2000 },
  { message: 'Preparing prompts for your brand voice...', duration: 2500 },
]

const VALIDATION_PHASES: Phase[] = [
  { message: 'Running quality checks on generated content...', duration: 3000 },
  { message: 'Checking language naturalness...', duration: 3000 },
  { message: 'Scanning for AI patterns...', duration: 3000 },
  { message: 'Finalizing posts...', duration: 5000 },
]

function buildPhases(total: number, postType: string): Phase[] {
  const typeLabel = postType === 'carousel' ? 'carousel' : 'post'

  const generationPhases: Phase[] = Array.from({ length: total }, (_, i) => ({
    message: `Generating ${typeLabel} ${i + 1} of ${total}...`,
    duration: 4000,
  }))

  return [...STATIC_PHASES, ...generationPhases, ...VALIDATION_PHASES]
}

export function GenerationProgress({ total, postType }: GenerationProgressProps) {
  const phases = buildPhases(total, postType)

  return <PhaseProgress phases={phases} subtitle="This usually takes 30–60 seconds" />
}

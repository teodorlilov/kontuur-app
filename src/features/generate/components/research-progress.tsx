'use client'

import { PhaseProgress, type Phase } from '@/components/ui/phase-progress'

interface ResearchProgressProps {
  clientName: string
}

function buildPhases(clientName: string): Phase[] {
  return [
    { message: `Loading brand profile for ${clientName}...`, duration: 1500 },
    { message: 'Checking content pillars and post history...', duration: 2000 },
    { message: 'Fetching RSS feeds and website sources...', duration: 3500 },
    { message: 'Analyzing source content...', duration: 2500 },
    { message: 'Generating weekly theme ideas with AI...', duration: 5000 },
    { message: 'Filtering for originality...', duration: 2000 },
  ]
}

export function ResearchProgress({ clientName }: ResearchProgressProps) {
  const phases = buildPhases(clientName)

  return <PhaseProgress phases={phases} subtitle="This usually takes 10–20 seconds" />
}

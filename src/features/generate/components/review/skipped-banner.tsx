'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { allocationCostOfSkips, type PillarAllocation } from '@/features/generate/lib/run-plan'
import type { SkippedPillar } from '@/ai/research/types'

interface SkippedBannerProps {
  skippedPillars: SkippedPillar[]
  allocation: PillarAllocation[]
  requested: number
  received: number
  clientId: string
}

/**
 * What the skips actually cost — the same sum the orchestrator reports as
 * skippedCount. A pillar allocated nothing this run cost nothing, and the
 * copy must not claim the run came back short when it did not.
 */
export function SkippedBanner({
  skippedPillars,
  allocation,
  requested,
  received,
  clientId,
}: SkippedBannerProps) {
  if (skippedPillars.length === 0) return null
  const names = skippedPillars.map((p) => p.name)
  const cost = allocationCostOfSkips(allocation, names)

  return (
    <div className="mb-4 flex items-start gap-3 rounded-panel bg-pending-bg px-4 py-3 text-caption text-text2">
      <AlertCircle aria-hidden className="mt-0.5 size-3.5 flex-none text-pending" strokeWidth={1.6} />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-pending">
          {names.length} pillar{names.length === 1 ? '' : 's'} skipped
        </span>{' '}
        — research found nothing for{' '}
        {names.map((name, i) => (
          <span key={name}>
            {i > 0 && ', '}
            <i>{name}</i>
          </span>
        ))}
        .{' '}
        {cost > 0
          ? `This run came back with ${received} post${received === 1 ? '' : 's'} instead of ${requested}.`
          : 'Nothing was allocated to it at this size, so the count is unaffected — but it stays skipped until it has a source.'}
      </p>
      <Link
        href={`/clients/${clientId}/sources`}
        className="flex-none whitespace-nowrap font-semibold text-pending underline decoration-pending/35 underline-offset-2"
      >
        Add a source
      </Link>
    </div>
  )
}

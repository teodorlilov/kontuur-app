'use client'

import Link from 'next/link'
import { computeRunPlan } from '@/features/generate/lib/run-plan'
import { ContentMixList } from '@/features/generate/components/setup/content-mix-list'
import { DEFAULT_RUN_SIZE } from '@/utils/constants'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { ClientSource } from '@/types/api'

interface SourcesRailProps {
  clientId: string
  pillars: WeightedPillar[]
  sources: ClientSource[]
  postsPerWeek: number
}

/**
 * The sources page's right rail: the generate panel's content-mix card,
 * rendered from this page's configuration at the client's usual run size —
 * the same object, so fixing a gap here visibly clears it there. Deliberately
 * no Generate button: the lime commitment exists only on /generate.
 */
export function SourcesRail({ clientId, pillars, sources, postsPerWeek }: SourcesRailProps) {
  const runSize = postsPerWeek > 0 ? postsPerWeek : DEFAULT_RUN_SIZE
  const activeSourceCount = sources.filter((s) => s.is_active).length

  const runPlan = computeRunPlan({
    pillars,
    targetPostCount: runSize,
    sources: sources
      .filter((s) => s.is_active)
      .map((s) => ({
        id: s.id,
        type: s.type,
        label: s.label,
        url: s.url,
        pillar_ids: s.pillar_ids,
      })),
    // The rail renders only the content mix — publishing is not previewed here,
    // so placeholder publish inputs keep computeRunPlan's signature untouched
    // for its generate consumers.
    connections: [],
    platform: 'Instagram',
  })

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
      <div className="surface-dark-capsule rounded-card bg-forest-deep p-5 text-ink-inv shadow-dark">
        <p className="text-label font-semibold uppercase text-ink-inv/55">
          Next run · as configured
        </p>
        <p className="mt-2 text-metric font-semibold tabular-nums text-accent">
          {runSize} post{runSize === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-caption text-ink-inv/70">Sized to this client’s weekly pace</p>

        <div className="mt-4 border-t border-white/10 pt-4">
          <ContentMixList allocation={runPlan.allocation} />
        </div>

        <Link
          href={`/generate?client=${clientId}`}
          className="mt-4 inline-block text-caption font-medium text-accent underline decoration-accent/40 underline-offset-2"
        >
          Open generate →
        </Link>
      </div>

      {activeSourceCount === 0 && (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-caption text-pending">
            No sources are active — posts will be written without source material to check them
            against.
          </p>
        </div>
      )}
    </aside>
  )
}

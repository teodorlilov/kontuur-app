'use client'

import Link from 'next/link'
import { DangerCircleIcon } from '@solar-icons/react/linear'
import { FLOW_NOTICE_ACTION_CLASS, FlowNotice } from '@/features/generate/components/flow-notice'
import type { SkippedPillars } from '@/lib/generation/runs'

interface SkippedBannerProps {
  /** The run's own record of what it could not cover — null for a run that covered everything. */
  skipped: SkippedPillars | null
  /** How many posts the run was asked for, from the run itself. */
  requested: number
  clientId: string
}

/**
 * What the skips actually cost, in the run's own numbers.
 *
 * Both come from the run: `cost` is what research allocated to those pillars before it found
 * nothing for them, and `requested` is what the run was asked for. Nothing is counted off the
 * drafts on screen — a resumed run shows only the ones still waiting, so counting them reported a
 * shortfall to anyone who had approved a few and come back. A pillar allocated nothing cost
 * nothing, and the copy says so.
 */
export function SkippedBanner({ skipped, requested, clientId }: SkippedBannerProps) {
  if (!skipped || skipped.names.length === 0) return null
  const { names, cost } = skipped

  return (
    <FlowNotice
      glyph={DangerCircleIcon}
      className="mb-4"
      action={
        <Link href={`/clients/${clientId}/sources`} className={FLOW_NOTICE_ACTION_CLASS}>
          Add a source
        </Link>
      }
    >
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
        ? `That left the run ${cost} post${cost === 1 ? '' : 's'} short of the ${requested} asked for.`
        : 'Nothing was allocated to it at this size, so the count is unaffected — but it stays skipped until it has a source.'}
    </FlowNotice>
  )
}

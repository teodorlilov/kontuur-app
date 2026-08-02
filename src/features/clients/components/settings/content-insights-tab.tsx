'use client'

import { EmptyState } from '@/components/layout/empty-state'
import { cn } from '@/utils/cn'
import type { ContentInsights, PillarRate } from '@/features/clients/lib/insights'

/** Below this, a pillar is being rewritten often enough to be worth calling out. */
const LOW_APPROVAL = 50

const TREND_LABEL: Record<ContentInsights['trend'], string> = {
  improving: 'Improving over the last 30 days',
  declining: 'Declining over the last 30 days',
  stable: 'Stable over the last 30 days',
  insufficient_data: 'Not enough history to show a trend yet',
}

interface ContentInsightsTabProps {
  insights: ContentInsights | null
}

/** Read-only: what the approved and published posts say about the guidance. */
export function ContentInsightsTab({ insights }: ContentInsightsTabProps) {
  if (!insights) {
    return (
      <EmptyState
        title="Not enough data yet"
        description="Approve and publish posts to see patterns here."
      />
    )
  }

  const weakest = insights.pillarRates.find((p) => p.rate < LOW_APPROVAL)

  return (
    <>
      {insights.avgScore !== null && (
        <div className="flex items-baseline gap-3.5 rounded-panel bg-wash px-5 py-[18px]">
          <span className="text-metric font-semibold tabular-nums text-forest">
            {insights.avgScore}
          </span>
          <span className="text-caption text-text2">
            Average quality score
            <br />
            <span className="text-text3">{TREND_LABEL[insights.trend]}</span>
          </span>
        </div>
      )}

      {insights.pillarRates.length > 0 && (
        <div className="mt-[18px]">
          <h4 className="mb-1.5 text-label font-semibold uppercase text-text3">
            Approval rate by pillar
          </h4>
          <p className="mb-2.5 text-xs text-text3">
            From the {insights.sampleSize} most recent posts with a pillar.
          </p>
          {insights.pillarRates.map((entry) => (
            <PillarBar key={entry.pillar} entry={entry} />
          ))}
        </div>
      )}

      {weakest && (
        <p className="mt-[18px] rounded-panel bg-wash px-4 py-3.5 text-caption leading-relaxed text-text2">
          <b className="font-semibold text-ink">{weakest.pillar}</b> posts are rewritten most often.
          Consider tightening that pillar&rsquo;s guidance in <b>Brand profile</b>, or lowering its
          share.
        </p>
      )}
    </>
  )
}

function PillarBar({ entry }: { entry: PillarRate }) {
  const low = entry.rate < LOW_APPROVAL

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-[190px] flex-none truncate text-body" title={entry.pillar}>
        {entry.pillar}
      </span>
      <span aria-hidden className="h-[7px] flex-1 overflow-hidden rounded-full bg-line">
        {/* Computed width: the one inline style DESIGN.md allows, because it encodes the value. */}
        <span
          className={cn('block h-full rounded-full', low ? 'bg-pending' : 'bg-forest')}
          style={{ width: `${entry.rate}%` }}
        />
      </span>
      <span className="w-11 flex-none text-right text-caption tabular-nums text-text3">
        {entry.rate}%
      </span>
    </div>
  )
}

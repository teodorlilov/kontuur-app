import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import type { ActiveRun } from '@/types/api'

interface ActiveRunsCardProps {
  runs: ActiveRun[]
}

/**
 * "Composing drafts" indicator. Presentational only — polling lives in
 * useActiveRuns, so hiding or remounting this card cannot start, stop or
 * duplicate it.
 */
export function ActiveRunsCard({ runs }: ActiveRunsCardProps) {
  const [run] = runs
  if (!run) return null

  const label = runs.length > 1 ? `${runs.length} clients` : run.clientName
  const progress = run.targetCount > 0 ? Math.min(run.doneCount / run.targetCount, 1) : 0
  const detail =
    run.doneCount > 0 && run.targetCount > 0
      ? `${run.doneCount} of ${run.targetCount} posts for ${label}`
      : `Researching for ${label}`

  return (
    <div className="surface-live mx-2.5 mb-3 rounded-panel border border-spring/20 p-3">
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-ink">
        <span className="live-dot size-1.5 shrink-0 rounded-full bg-spring" />
        Composing drafts
      </div>
      <div className="mt-[3px] text-[11px] text-text3">
        {detail} · {formatRelativeTime(parseTimestamp(run.startedAt))}
      </div>
      <div className="mt-2.5 h-[3px] overflow-hidden rounded-sm bg-forest/10">
        {progress > 0 ? (
          <span
            className="block h-full rounded-sm bg-spring transition-[width] duration-500 ease-contour"
            style={{ width: `${progress * 100}%` }}
          />
        ) : (
          <span className="live-sweep block h-full w-2/5 rounded-sm bg-spring" />
        )}
      </div>
    </div>
  )
}

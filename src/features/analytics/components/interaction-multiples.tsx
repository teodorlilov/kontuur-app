import { cn } from '@/utils/cn'
import type { ComparisonRow } from '../lib/build-report'
import { deltaPct } from '../lib/build-report'
import { formatCount } from '../lib/format'
import { DeltaChip } from './delta-chip'

const MINI_MAX_PX = 48
const MINI_MIN_PX = 8

/**
 * Five small multiples, one per interaction kind, each pair on ITS OWN scale —
 * the comparison is within the pair, not across kinds (312 comments beside
 * 2,410 likes would flatten every other column).
 */
export function InteractionMultiples({ kinds }: { kinds: ComparisonRow[] }) {
  const spoken = kinds
    .map((kind) => {
      if (kind.now === null) return `${kind.label}: no data this period.`
      const delta = deltaPct(kind.now, kind.then)
      return `${kind.label}: ${formatCount(kind.now)} against ${
        kind.then === null ? 'no previous data' : formatCount(kind.then)
      }${delta === null ? '' : `, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)} percent`}.`
    })
    .join(' ')

  return (
    <div
      role="img"
      aria-label={`Paired columns. ${spoken}`}
      className="mt-2 grid grid-cols-2 md:grid-cols-5"
    >
      {kinds.map((kind, index) => {
        const pairMax = Math.max(kind.now ?? 0, kind.then ?? 0, 1)
        const heightOf = (value: number | null): number =>
          value === null || value === 0 ? 0 : Math.max(MINI_MIN_PX, (value / pairMax) * MINI_MAX_PX)
        return (
          <div
            key={kind.key}
            className={cn(
              'py-3.5 pr-4',
              index % 2 === 1 && 'border-l border-ink/[0.05] pl-4',
              index >= 2 && 'border-t border-ink/[0.05] md:border-t-0',
              index > 0 && 'md:border-l md:border-ink/[0.05] md:pl-4'
            )}
          >
            <div className="text-label text-text3">{kind.label}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <b className="text-display font-sans font-semibold not-italic tabular-nums text-ink">
                {kind.now === null ? '—' : formatCount(kind.now)}
              </b>
              <DeltaChip value={deltaPct(kind.now, kind.then)} />
            </div>
            <div className="mt-2.5 flex h-12 items-end gap-1.5" aria-hidden="true">
              {kind.then !== null && kind.then > 0 && (
                <i
                  className="block w-4 rounded-t bg-metric-3"
                  // Computed height — per-pair scale.
                  style={{ height: `${heightOf(kind.then).toFixed(0)}px` }}
                />
              )}
              {kind.now !== null && kind.now > 0 && (
                <i
                  className="block w-4 rounded-t bg-forest"
                  style={{ height: `${heightOf(kind.now).toFixed(0)}px` }}
                />
              )}
            </div>
            <div className="mt-1 text-micro tabular-nums text-text3">
              {kind.then === null ? 'no previous period' : `${formatCount(kind.then)} then`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

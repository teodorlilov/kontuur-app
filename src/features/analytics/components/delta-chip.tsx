import { cn } from '@/utils/cn'
import type { DeltaVerdict } from '../lib/delta-verdict'
import { formatCount } from '../lib/format'

interface DeltaChipProps {
  verdict: DeltaVerdict
  /** 'count' prints absolutes as whole counts; 'pt' as percentage points. */
  unit?: 'count' | 'pt'
  /** For metrics where up is bad (losses): flips the coloring, never the arrow. */
  invert?: boolean
  className?: string
}

function signedAbs(diff: number, unit: 'count' | 'pt'): string {
  const magnitude =
    unit === 'pt' ? `${Math.abs(diff).toFixed(1)} pt` : formatCount(Math.abs(Math.round(diff)))
  return `${diff > 0 ? '+' : '−'}${magnitude}`
}

/**
 * The one delta treatment, verdict-driven (see delta-verdict): colored by
 * desirability only when the change clears the noise band — forest on Wash
 * going up, Clay going down — with the percentage printed only on a solid
 * base. Inside the band it states the absolute quietly in gray, so a +2 off
 * a base of 1 can never out-shout a real move. Living Green Text is
 * deliberately not used here (4.1:1 on Wash, under the chip's own bar).
 */
export function DeltaChip({ verdict, unit = 'count', invert = false, className }: DeltaChipProps) {
  if (verdict.kind === 'none') return null

  if (verdict.kind === 'quiet') {
    const flat = Math.abs(verdict.diff) < 0.05
    return (
      <span
        className={cn(
          'whitespace-nowrap rounded-full bg-sunken px-2 py-0.5 text-micro font-semibold tabular-nums text-text2',
          className
        )}
      >
        {flat ? '—' : signedAbs(verdict.diff, unit)}{' '}
        <span className="sr-only">{flat ? 'unchanged' : 'within normal variation'}</span>
      </span>
    )
  }

  const up = verdict.diff > 0
  const desirable = invert ? !up : up
  const magnitude =
    verdict.pct !== null ? `${Math.abs(verdict.pct).toFixed(1)}%` : signedAbs(verdict.diff, unit)
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums',
        desirable ? 'bg-wash text-forest' : 'bg-danger-bg text-danger',
        className
      )}
    >
      {up ? '▲' : '▼'} {magnitude}
    </span>
  )
}

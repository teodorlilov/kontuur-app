import { cn } from '@/utils/cn'
import type { DeltaVerdict } from '../../lib/compute/delta-verdict'
import { signedCount } from '../../lib/compute/format'

interface DeltaChipProps {
  verdict: DeltaVerdict
  /** 'count' prints absolutes as whole counts; 'pt' as percentage points. */
  unit?: 'count' | 'pt'
  /** For metrics where up is bad (losses): flips the coloring, never the arrow. */
  invert?: boolean
  className?: string
}

function signedAbs(diff: number, unit: 'count' | 'pt'): string {
  // Never called with a zero diff: `move` needs |diff| past the ±2√N band (≥2) and `quiet`
  // prints an em dash below 0.05, so signedCount's `>= 0` rule can never render "+0".
  if (unit === 'count') return signedCount(Math.round(diff))
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} pt`
}

/**
 * The one delta treatment, verdict-driven (see delta-verdict): colored only once the change
 * clears the noise band, and the percentage printed only on a solid base — inside the band it
 * states the absolute quietly in gray, so a +2 off a base of 1 cannot out-shout a real move.
 *
 * The up-chip is Deep Pine, not Living Green Text: DESIGN.md:208 measures `#278658` at 4.53:1
 * on white, but on this chip's Wash ground it falls to ~4.1:1 — under the 4.5:1 bar that 11px
 * `text-micro` needs.
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

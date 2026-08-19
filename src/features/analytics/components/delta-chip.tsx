import { cn } from '@/utils/cn'

interface DeltaChipProps {
  /** Signed change; null renders nothing — no comparison exists yet. */
  value: number | null
  /** 'pct' renders "15.1%", 'pt' renders "0.4 pt" (percentage points). */
  unit?: 'pct' | 'pt'
  className?: string
}

/**
 * The one delta treatment: colored by desirability, not direction — forest on
 * Wash going up, Clay going down, quiet when nothing moved. Living Green Text
 * is deliberately not used here (4.1:1 on Wash, under the chip's own bar).
 */
export function DeltaChip({ value, unit = 'pct', className }: DeltaChipProps) {
  if (value === null) return null
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  const magnitude =
    unit === 'pct' ? `${Math.abs(value).toFixed(1)}%` : `${Math.abs(value).toFixed(1)} pt`
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums',
        flat ? 'bg-sunken text-text2' : up ? 'bg-wash text-forest' : 'bg-danger-bg text-danger',
        className
      )}
    >
      {flat ? (
        <>
          — <span className="sr-only">unchanged</span>
        </>
      ) : (
        `${up ? '▲' : '▼'} ${magnitude}`
      )}
    </span>
  )
}

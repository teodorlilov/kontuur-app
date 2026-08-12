'use client'

import { cn } from '@/utils/cn'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { FOCUS_RING } from '@/components/ui/form/control-classes'

interface PillarChipProps {
  pillar: string
  /** Lit = this source feeds the pillar; hollow = it does not. */
  lit: boolean
  onToggle: () => void
}

/**
 * One pillar as a toggleable chip on a source card. Lit uses the app's pillar
 * treatment verbatim (identity tint + hue darkened into ink); unlit keeps the
 * same shape as an outlined slot so the full pillar list stays readable.
 */
export function PillarChip({ pillar, lit, onToggle }: PillarChipProps) {
  const color = getPillarColor(pillar)
  return (
    <button
      type="button"
      aria-pressed={lit}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-label font-medium transition-colors',
        FOCUS_RING,
        !lit && 'border border-line2 text-text3 hover:border-line hover:text-text2'
      )}
      style={lit ? { background: color.bg, color: color.text } : undefined}
    >
      <span
        aria-hidden
        className={cn('size-1.5 flex-none rounded-full', !lit && 'border border-line2 bg-transparent')}
        style={lit ? { background: color.hex } : undefined}
      />
      {pillar}
    </button>
  )
}

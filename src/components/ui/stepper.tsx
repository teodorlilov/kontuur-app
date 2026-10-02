import { AddIcon, MinusIcon } from '@solar-icons/react/linear'
import { Icon } from '@/components/ui/icon'

interface StepperProps {
  value: number
  min: number
  max: number
  decrementLabel: string
  incrementLabel: string
  onChange: (value: number) => void
}

/**
 * A −/value/+ control for a small whole number, each button shut at its bound. Shared by the
 * generate wizard's post and slide counts (`CountSteppers`) and the plan's client slots
 * (`ClientSlotsControl`); the labels name what one step does, for a screen reader.
 */
export function Stepper({
  value,
  min,
  max,
  decrementLabel,
  incrementLabel,
  onChange,
}: StepperProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-chip border border-line2 bg-surface p-1">
      <button
        type="button"
        aria-label={decrementLabel}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-wash hover:text-forest disabled:pointer-events-none disabled:opacity-35"
      >
        <Icon glyph={MinusIcon} size="xs" />
      </button>
      <span className="min-w-8 text-center text-title font-semibold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        aria-label={incrementLabel}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-wash hover:text-forest disabled:pointer-events-none disabled:opacity-35"
      >
        <Icon glyph={AddIcon} size="xs" />
      </button>
    </span>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import { clamp } from '@/lib/canvas/clamp'
import { EDITOR_CONTROL, FOCUS_RING } from './workspace/chrome'

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  icon?: React.ReactNode
  onChange: (value: number) => void
}

/**
 * A compact numeric control. The label is the tooltip — the toolbar has no room for a caption.
 *
 * Type a value, step it with the arrows beside it, or hold ↑/↓ in the field.
 *
 * A plain `type="number"` cannot do this job here. Its stepper is hidden app-wide (see
 * `globals.css`: at this width the native buttons clipped the digits they sat beside), which left
 * the keyboard as the only way to step — and a number input also refuses to display a partial value
 * like "-", so typing a negative rotation dropped its sign. Both are handled here instead, in one
 * place, rather than by fighting the global rule.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  icon,
  onChange,
}: NumberFieldProps) {
  /**
   * What the field shows while the user is mid-edit, before it means anything yet.
   *
   * Clamping every keystroke made the field unusable. Size starts at 8, so the first digit of any
   * number below 8 became 8 — typing 12 gave 82 — and clearing the box parsed as 0, because
   * `Number('')` is 0 rather than NaN, which clamped back to 8 before a second digit could be
   * typed. So a keystroke only commits once it IS a value: in range as typed, or settled by blur
   * or Enter.
   */
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (raw: string) => {
    setDraft(null)
    const parsed = Number(raw)
    // An abandoned edit reverts rather than guessing: the field snaps back to the live value.
    if (raw.trim() === '' || Number.isNaN(parsed)) return
    onChange(clamp(parsed, min, max))
  }

  const stepBy = (delta: number) => {
    setDraft(null)
    // Quantised to the step, then trimmed: line height moves in 0.05s, and 1.35 + 0.05 is
    // 1.4000000000000001 in binary floating point — which would show in the field and be stored.
    const next = Math.round((value + delta) / step) * step
    onChange(clamp(Number(next.toFixed(4)), min, max))
  }

  return (
    <div className="inline-flex items-center gap-0.5 text-text3">
      <label title={label} className="inline-flex items-center gap-1">
        {icon}
        <span className="sr-only">{label}</span>
        <input
          type="text"
          inputMode="numeric"
          // Not `type="number"`: see above. The keyboard contract it would have given us is
          // reimplemented below, so nothing is lost but the quirks.
          value={draft ?? value}
          onChange={(event) => {
            const raw = event.target.value
            const parsed = Number(raw)
            // Live where it can be — a value already inside the range reaches the canvas as it is
            // typed. Everything else waits, so a half-typed number is never clamped into a whole
            // one behind the user's hands.
            if (raw.trim() !== '' && !Number.isNaN(parsed) && parsed >= min && parsed <= max) {
              setDraft(null)
              onChange(parsed)
            } else {
              setDraft(raw)
            }
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') return commit(event.currentTarget.value)
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              stepBy(step)
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              stepBy(-step)
            }
          }}
          className={cn(EDITOR_CONTROL, 'w-[54px] tabular-nums')}
        />
      </label>
      {/* The affordance the hidden native spinner took away, at a size that fits: a 14px column
          beside the digits rather than on top of them. */}
      <div className="flex flex-col">
        <StepButton label={`Increase ${label}`} onClick={() => stepBy(step)}>
          <ChevronUp size={11} aria-hidden />
        </StepButton>
        <StepButton label={`Decrease ${label}`} onClick={() => stepBy(-step)}>
          <ChevronDown size={11} aria-hidden />
        </StepButton>
      </div>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Not held-repeat: a press is one step and one undo entry, which is what a nudge should be.
      onClick={onClick}
      className={cn(
        FOCUS_RING,
        'flex h-[15px] w-4 cursor-pointer items-center justify-center rounded-xs',
        'text-text3 transition-colors duration-150 ease-contour hover:bg-ink/[0.05] hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

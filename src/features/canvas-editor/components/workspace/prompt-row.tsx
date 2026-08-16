'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { EDITOR_BUTTON, EDITOR_CONTROL } from './chrome'

interface PromptRowProps {
  /** Placeholder text — the only thing that says what this particular prompt is for. */
  placeholder: string
  /** The action's label, e.g. "Draw" or "Generate". */
  submitLabel: string
  /** Rendered inside the submit button, before the label. */
  icon?: React.ReactNode
  title?: string
  busy?: boolean
  /** Allow submitting with an empty prompt — "generate again" needs no words. */
  allowEmpty?: boolean
  onSubmit: (prompt: string) => void
}

/**
 * A prompt field with its own submit button, shared by the Elements panel's "Draw a vector" and the
 * AI panel's "Generate a background" — both spelled out the same trim-guard, disabled rule and
 * control classes.
 *
 * The mode bar's inpaint prompt deliberately does NOT use this: its text is read by two different
 * buttons (Apply and Remove object) and sits interleaved with the brush controls, so it needs
 * lifted state and a layout this shape cannot express. Forcing it through here would cost more than
 * the duplication saves.
 *
 * Owns its draft text: every caller wants the field cleared on submit, and nothing upstream should
 * re-render per keystroke.
 */
export function PromptRow({
  placeholder,
  submitLabel,
  icon,
  title,
  busy,
  allowEmpty,
  onSubmit,
}: PromptRowProps) {
  const [prompt, setPrompt] = useState('')
  const trimmed = prompt.trim()
  const canSubmit = !busy && (allowEmpty || trimmed.length > 0)

  const submit = () => {
    if (!canSubmit) return
    onSubmit(trimmed)
    setPrompt('')
  }

  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={prompt}
        placeholder={placeholder}
        onChange={(event) => setPrompt(event.target.value)}
        // Enter submits: the field is one line and the button is the only other control.
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          submit()
        }}
        className={cn(EDITOR_CONTROL, 'min-w-0 flex-1')}
      />
      <button
        type="button"
        className={EDITOR_BUTTON}
        disabled={!canSubmit}
        title={title ?? submitLabel}
        onClick={submit}
      >
        {icon} {submitLabel}
      </button>
    </div>
  )
}

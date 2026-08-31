'use client'

import { MessageCircle } from 'lucide-react'

interface FeedbackBoxProps {
  mode: 'input' | 'read-only'
  value: string
  onChange?: (v: string) => void
}

/** Read-only card showing previously submitted feedback. */
function ReadOnlyFeedback({ value }: { value: string }) {
  return (
    <div className="rounded-[12px] border border-forest/20 bg-forest/4 px-4 py-3.5">
      {/* tracking-normal: cancels the Label role's built-in 0.16em — this reads as a
          sentence fragment, not a spaced-out eyebrow. */}
      <div className="mb-2 flex items-center gap-[5px] text-label font-medium tracking-normal text-forest">
        <MessageCircle size={11} />
        Feedback you sent
      </div>
      <div className="text-body text-ink">{value}</div>
    </div>
  )
}

/** Textarea input for writing feedback on a pending post. */
function FeedbackInput({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  return (
    <div className="rounded-[12px] border border-ink/10 bg-surface px-4 py-3.5">
      {/* tracking-normal: cancels the Label role's built-in 0.16em — this is a field
          label read as words, not a spaced-out eyebrow. */}
      <div className="mb-2 text-label font-medium tracking-normal text-text2">
        Leave feedback (optional)
      </div>
      {/* leading-[1.55]: the Body role runs 1.6, which spaces a 3-row input taller
          than the box it has to sit in. */}
      <textarea
        className="w-full resize-none rounded-sm border border-ink/16 bg-surface px-3 py-[9px] text-body leading-[1.55] text-ink transition-[border-color] duration-150 ease-[ease]"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="e.g. Can we soften the tone on slide 2? Also please add the clinic's phone number to the CTA slide..."
        rows={3}
        // Stays inline: an `outline-none` class would lose to the unlayered
        // `:focus-visible` ring in globals.css, so the field would gain a ring it
        // does not have today. Inline is the only expression that still wins.
        style={{ outline: 'none' }}
      />
    </div>
  )
}

/** Feedback area — input mode for pending posts, read-only for posts with feedback. */
export function FeedbackBox({ mode, value, onChange }: FeedbackBoxProps) {
  if (mode === 'read-only') return <ReadOnlyFeedback value={value} />
  return <FeedbackInput value={value} onChange={onChange} />
}

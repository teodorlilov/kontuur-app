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
    <div
      style={{
        background: 'rgba(22,68,48,0.04)',
        border: '1px solid rgba(22,68,48,0.20)',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div
        className="text-label tracking-normal"
        style={{
          fontWeight: 500,
          color: 'var(--forest)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <MessageCircle size={11} />
        Feedback you sent
      </div>
      <div className="text-body" style={{ color: 'var(--ink)', lineHeight: 1.6 }}>
        {value}
      </div>
    </div>
  )
}

/** Textarea input for writing feedback on a pending post. */
function FeedbackInput({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid rgba(15,21,18,0.10)',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div
        className="text-label tracking-normal"
        style={{ fontWeight: 500, color: 'var(--text2)', marginBottom: 8 }}
      >
        Leave feedback (optional)
      </div>
      <textarea
        className="text-body"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="e.g. Can we soften the tone on slide 2? Also please add the clinic's phone number to the CTA slide..."
        rows={3}
        style={{
          width: '100%',
          padding: '9px 12px',
          border: '1px solid rgba(15,21,18,0.16)',
          borderRadius: 8,
          fontFamily: 'inherit',
          color: 'var(--ink)',
          background: '#fff',
          outline: 'none',
          resize: 'none',
          lineHeight: 1.55,
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  )
}

/** Feedback area — input mode for pending posts, read-only for posts with feedback. */
export function FeedbackBox({ mode, value, onChange }: FeedbackBoxProps) {
  if (mode === 'read-only') return <ReadOnlyFeedback value={value} />
  return <FeedbackInput value={value} onChange={onChange} />
}

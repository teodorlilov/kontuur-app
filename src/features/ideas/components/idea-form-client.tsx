'use client'

import { useState } from 'react'

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X', 'TikTok'] as const

interface IdeaBrief {
  id: string
  ideaText: string
  extraNotes: string
  platform: string
  targetDate: string
}

interface IdeaFormClientProps {
  token: string
  clientName: string
  agencyName: string
}

function createBrief(): IdeaBrief {
  return {
    id: crypto.randomUUID(),
    ideaText: '',
    extraNotes: '',
    platform: '',
    targetDate: '',
  }
}

/** Public idea form — no auth required. */
export function IdeaFormClient({ token, clientName, agencyName }: IdeaFormClientProps) {
  const [briefs, setBriefs] = useState<IdeaBrief[]>([createBrief()])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateBrief(id: string, field: keyof IdeaBrief, value: string) {
    setBriefs((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  function addBrief() {
    setBriefs((prev) => [...prev, createBrief()])
  }

  function removeBrief(id: string) {
    setBriefs((prev) => prev.filter((b) => b.id !== id))
  }

  async function handleSubmit() {
    const valid = briefs.filter((b) => b.ideaText.trim())
    if (valid.length === 0) {
      setError('Please describe at least one post idea')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/ideas/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ideas: valid }),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setSubmitted(false)
    setBriefs([createBrief()])
    setError(null)
  }

  if (submitted) {
    return <SuccessView agencyName={agencyName} onReset={handleReset} />
  }

  const hasValidIdea = briefs.some((b) => b.ideaText.trim())

  return (
    <div style={{ minHeight: '100vh' }}>
      <FormHeader agencyName={agencyName} clientName={clientName} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 24px 48px' }}>
        {briefs.map((brief, i) => (
          <BriefCard
            key={brief.id}
            brief={brief}
            index={i}
            canRemove={briefs.length > 1}
            onUpdate={(field, value) => updateBrief(brief.id, field, value)}
            onRemove={() => removeBrief(brief.id)}
          />
        ))}

        <button onClick={addBrief} style={addButtonStyle}>
          + Add another idea
        </button>

        {error && (
          <div className="text-caption" style={{ color: 'var(--danger)', marginTop: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !hasValidIdea}
          style={{
            ...submitButtonStyle,
            opacity: submitting || !hasValidIdea ? 0.5 : 1,
            cursor: submitting || !hasValidIdea ? 'default' : 'pointer',
          }}
        >
          {submitting
            ? 'Sending...'
            : `Send idea${briefs.filter((b) => b.ideaText.trim()).length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function FormHeader({ agencyName, clientName }: { agencyName: string; clientName: string }) {
  return (
    <div style={{ background: 'var(--forest-deep)', padding: '22px 0 0' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 24px 20px' }}>
        <div
          className="text-label"
          style={{
            fontWeight: 500,
            color: 'rgba(242,245,241,0.45)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--spring-text)',
              display: 'inline-block',
            }}
          />
          {agencyName}
        </div>
        {/* Sans, not the display serif: client names may be Cyrillic and
            Instrument Serif has no Cyrillic glyphs. */}
        <div
          className="text-headline"
          style={{
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#F2F5F1',
            marginBottom: 5,
          }}
        >
          Share a post idea, {clientName}
        </div>
        <div className="text-body" style={{ color: 'rgba(242,245,241,0.55)', lineHeight: 1.55 }}>
          Tell us what you'd like to post and we'll take it from there. No login needed — just fill
          in the form below.
        </div>
      </div>
    </div>
  )
}

function BriefCard({
  brief,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: {
  brief: IdeaBrief
  index: number
  canRemove: boolean
  onUpdate: (field: keyof IdeaBrief, value: string) => void
  onRemove: () => void
}) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={labelStyle}>Idea {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} style={removeButtonStyle}>
            Remove
          </button>
        )}
      </div>

      <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FieldGroup label="What's the post about?" required>
          <textarea
            value={brief.ideaText}
            onChange={(e) => onUpdate('ideaText', e.target.value)}
            placeholder="Describe the topic, angle, or message you have in mind..."
            rows={3}
            style={textareaStyle}
          />
        </FieldGroup>

        <FieldGroup label="Anything specific to include?">
          <textarea
            value={brief.extraNotes}
            onChange={(e) => onUpdate('extraNotes', e.target.value)}
            placeholder="Specific products, phrases, things to avoid..."
            rows={2}
            style={textareaStyle}
          />
        </FieldGroup>

        <FieldGroup label="Platform">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLATFORMS.map((p) => (
              <button
                className="text-caption"
                key={p}
                type="button"
                onClick={() => onUpdate('platform', brief.platform === p ? '' : p)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontWeight: 500,
                  border:
                    brief.platform === p
                      ? '1.5px solid var(--forest-deep)'
                      : '1px solid rgba(15,21,18,0.14)',
                  background: brief.platform === p ? 'var(--forest-deep)' : '#fff',
                  color: brief.platform === p ? '#f2f5f1' : 'var(--text2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </FieldGroup>

        <FieldGroup label="Target date">
          <input
            type="date"
            value={brief.targetDate}
            onChange={(e) => onUpdate('targetDate', e.target.value)}
            style={inputStyle}
          />
        </FieldGroup>
      </div>
    </div>
  )
}

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        className="text-caption"
        style={{ fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}
      >
        {label}
        {required && <span style={{ color: 'var(--spring-text)', marginLeft: 3 }}>*</span>}
      </div>
      {children}
    </div>
  )
}

function SuccessView({ agencyName, onReset }: { agencyName: string; onReset: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div
          className="text-headline"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(46,158,104,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          ✓
        </div>
        <div
          className="text-headline"
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontWeight: 400,
            color: 'var(--ink)',
            marginBottom: 8,
          }}
        >
          Ideas sent!
        </div>
        <div
          className="text-body"
          style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}
        >
          {agencyName} will review your ideas and get in touch.
        </div>
        <button onClick={onReset} style={submitButtonStyle}>
          Submit more ideas
        </button>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(15,21,18,0.12)',
  borderRadius: 13,
  overflow: 'hidden',
  marginBottom: 12,
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 18px',
  borderBottom: '1px solid rgba(15,21,18,0.07)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-label)',
  fontWeight: 500,
  color: 'var(--spring-text)',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
}

const removeButtonStyle: React.CSSProperties = {
  fontSize: 'var(--text-micro)',
  color: 'rgba(15,21,18,0.7)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 'var(--text-body)',
  fontFamily: 'inherit',
  border: '1px solid rgba(15,21,18,0.14)',
  borderRadius: 8,
  padding: '10px 12px',
  color: 'var(--ink)',
  resize: 'vertical',
  lineHeight: 1.6,
  background: '#fff',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 'var(--text-body)',
  fontFamily: 'inherit',
  border: '1px solid rgba(15,21,18,0.14)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--ink)',
  background: '#fff',
}

const addButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  borderRadius: 10,
  fontSize: 'var(--text-caption)',
  fontWeight: 500,
  color: 'var(--text2)',
  background: 'none',
  border: '1px dashed rgba(15,21,18,0.16)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginBottom: 20,
}

const submitButtonStyle: React.CSSProperties = {
  padding: '11px 24px',
  borderRadius: 9,
  fontSize: 'var(--text-body)',
  fontWeight: 500,
  color: '#f2f5f1',
  background: 'var(--forest-deep)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
}

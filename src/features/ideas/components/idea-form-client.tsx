'use client'

import { useState } from 'react'
import { PLATFORMS } from '@/utils/constants'
import { cn } from '@/utils/cn'
import type { IdeaBrief } from '@/features/ideas/schemas'

/**
 * A brief while the form still holds it: every field present (empty until typed)
 * plus a key for React. Derived from the submitted shape so the two cannot drift.
 */
type DraftBrief = Required<IdeaBrief> & { id: string }

interface IdeaFormClientProps {
  token: string
  clientName: string
  agencyName: string
}

function createBrief(): DraftBrief {
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
  const [briefs, setBriefs] = useState<DraftBrief[]>([createBrief()])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateBrief(id: string, field: keyof DraftBrief, value: string) {
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
    <div className="min-h-screen">
      <FormHeader agencyName={agencyName} clientName={clientName} />

      <div className="max-w-[560px] mx-auto px-6 pt-6 pb-12">
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

        <button onClick={addBrief} className={ADD_BUTTON_CLASS}>
          + Add another idea
        </button>

        {error && <div className="text-caption text-danger mt-3">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !hasValidIdea}
          className={cn(
            SUBMIT_BUTTON_CLASS,
            (submitting || !hasValidIdea) && 'opacity-50 cursor-default'
          )}
          style={{ transition: 'background 0.15s' }}
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
    <div className="bg-forest-deep pt-[22px]">
      <div className="max-w-[560px] mx-auto px-6 pb-5">
        {/* tracking-[2px] is the eyebrow's original letter-spacing — wider than
            text-label's own 0.16em, which is 1.6px at this size. */}
        <div className="text-label tracking-[2px] font-medium text-ink-inv/45 uppercase mb-1.5 flex items-center gap-[7px]">
          <span className="w-[5px] h-[5px] rounded-full bg-spring-text inline-block" />
          {agencyName}
        </div>
        {/* Sans, not the display serif: client names may be Cyrillic and
            Instrument Serif has no Cyrillic glyphs. */}
        {/* tracking-[-0.01em] is this heading's original letter-spacing, looser
            than text-headline's own -0.02em. */}
        <div className="text-headline tracking-[-0.01em] font-semibold text-ink-inv mb-[5px]">
          Share a post idea, {clientName}
        </div>
        {/* leading-[1.55] is the intro's original line-height, tighter than text-body's 1.6. */}
        <div className="text-body leading-[1.55] text-ink-inv/55">
          Tell us what you&apos;d like to post and we&apos;ll take it from there. No login needed —
          just fill in the form below.
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
  brief: DraftBrief
  index: number
  canRemove: boolean
  onUpdate: (field: keyof DraftBrief, value: string) => void
  onRemove: () => void
}) {
  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <span className={LABEL_CLASS}>Idea {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className={REMOVE_BUTTON_CLASS}>
            Remove
          </button>
        )}
      </div>

      <div className="px-[18px] pt-3.5 pb-[18px] flex flex-col gap-3.5">
        <FieldGroup label="What's the post about?" required>
          <textarea
            value={brief.ideaText}
            onChange={(e) => onUpdate('ideaText', e.target.value)}
            placeholder="Describe the topic, angle, or message you have in mind..."
            rows={3}
            className={TEXTAREA_CLASS}
          />
        </FieldGroup>

        <FieldGroup label="Anything specific to include?">
          <textarea
            value={brief.extraNotes}
            onChange={(e) => onUpdate('extraNotes', e.target.value)}
            placeholder="Specific products, phrases, things to avoid..."
            rows={2}
            className={TEXTAREA_CLASS}
          />
        </FieldGroup>

        <FieldGroup label="Platform">
          <div className="flex gap-1.5 flex-wrap">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate('platform', brief.platform === p ? '' : p)}
                className={cn(
                  'text-caption px-3 py-[5px] rounded-[6px] font-medium cursor-pointer',
                  brief.platform === p
                    ? 'border-[1.5px] border-forest-deep bg-forest-deep text-ink-inv'
                    : 'border border-ink/14 bg-surface text-text2'
                )}
                style={{ transition: 'all 0.15s' }}
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
            className={INPUT_CLASS}
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
      <div className="text-caption font-medium text-ink mb-1.5">
        {label}
        {required && <span className="text-spring-text ml-[3px]">*</span>}
      </div>
      {children}
    </div>
  )
}

function SuccessView({ agencyName, onReset }: { agencyName: string; onReset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="text-center max-w-[400px]">
        <div className="text-headline w-12 h-12 rounded-full bg-spring/12 flex items-center justify-center mx-auto mb-4">
          ✓
        </div>
        <div className="text-headline font-display font-normal text-ink mb-2">Ideas sent!</div>
        <div className="text-body text-text2 mb-5">
          {agencyName} will review your ideas and get in touch.
        </div>
        <button
          onClick={onReset}
          className={SUBMIT_BUTTON_CLASS}
          style={{ transition: 'background 0.15s' }}
        >
          Submit more ideas
        </button>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────

const CARD_CLASS = 'bg-surface border border-ink/12 rounded-[13px] overflow-hidden mb-3'

const CARD_HEADER_CLASS =
  'flex items-center justify-between px-[18px] py-2.5 border-b border-b-ink/7'

// tracking-[1.2px] is this label's original letter-spacing, not text-label's 0.16em;
// leading-[1.6] holds the body line-height it inherited when it only set a size.
const LABEL_CLASS =
  'text-label tracking-[1.2px] leading-[1.6] font-medium text-spring-text uppercase'

// leading-[1.6]: preflight's `font: inherit` gave this button the body line-height,
// which text-micro's 1.35 would otherwise tighten.
const REMOVE_BUTTON_CLASS = 'text-micro leading-[1.6] text-ink/70 cursor-pointer'

const TEXTAREA_CLASS =
  'w-full text-body border border-ink/14 rounded-sm px-3 py-2.5 text-ink resize-y bg-surface'

const INPUT_CLASS = 'w-full text-body border border-ink/14 rounded-sm px-3 py-2 text-ink bg-surface'

// leading-[1.6]: same as the remove button — the inherited body line-height, which
// text-caption's 1.4 would otherwise tighten.
const ADD_BUTTON_CLASS =
  'w-full px-4 py-[11px] rounded-md text-caption leading-[1.6] font-medium text-text2 border border-dashed border-ink/16 cursor-pointer mb-5'

const SUBMIT_BUTTON_CLASS =
  'px-6 py-[11px] rounded-[9px] text-body font-medium text-ink-inv bg-forest-deep cursor-pointer'

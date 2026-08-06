'use client'

import { Zap } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'
import type { ClientIdea } from '@/types/api'

interface IdeaCardProps {
  idea: ClientIdea
  clientDotColor: string
  onGenerate: (idea: ClientIdea) => void
  onDismiss: (id: string) => void
}

/** Single idea card for the ideas inbox. */
export function IdeaCard({ idea, clientDotColor, onGenerate, onDismiss }: IdeaCardProps) {
  const isUnread = !idea.readAt
  const isGenerated = idea.status === 'generated'

  return (
    <div className={CARD_CLASS} style={{ transition: 'box-shadow 0.15s' }}>
      <CardHeader idea={idea} clientDotColor={clientDotColor} isUnread={isUnread} />

      {/* leading-[1.68] is the quote's original line-height, looser than text-body's 1.6. */}
      <div className="text-body px-4 py-[13px] text-ink leading-[1.68]">
        &ldquo;{idea.ideaText}&rdquo;
      </div>

      {idea.extraNotes && (
        // leading-[1.6] is the note's original line-height, looser than text-caption's 1.4.
        <div className="text-caption px-4 pb-[13px] text-text2 leading-[1.6]">
          {idea.extraNotes}
        </div>
      )}

      <CardFooter
        idea={idea}
        isGenerated={isGenerated}
        onGenerate={onGenerate}
        onDismiss={onDismiss}
      />
    </div>
  )
}

function CardHeader({
  idea,
  clientDotColor,
  isUnread,
}: {
  idea: ClientIdea
  clientDotColor: string
  isUnread: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-[11px] border-b border-b-ink/7 flex-wrap">
      {isUnread && <UnreadDot />}

      <div className="text-caption flex items-center gap-1.5 font-medium text-ink">
        <div
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{ background: clientDotColor }}
        />
        {idea.clientName}
      </div>

      {idea.clientNiche && (
        <>
          <Separator />
          <span className="text-micro text-text2">{idea.clientNiche}</span>
        </>
      )}

      {idea.platform && <PlatformPill label={idea.platform} />}

      {idea.targetDate && <span className={META_PILL_CLASS}>Target: {idea.targetDate}</span>}

      {idea.status === 'generated' && <span className={GENERATED_BADGE_CLASS}>✓ Generated</span>}

      <span className="text-micro text-ink/70 ml-auto">
        {formatRelativeTime(new Date(idea.submittedAt))}
      </span>
    </div>
  )
}

function CardFooter({
  idea,
  isGenerated,
  onGenerate,
  onDismiss,
}: {
  idea: ClientIdea
  isGenerated: boolean
  onGenerate: (idea: ClientIdea) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div className={FOOTER_CLASS}>
      {isGenerated ? (
        <span className="text-micro text-text2">Post generated</span>
      ) : idea.status === 'generating' ? (
        <span className="text-micro text-spring-text">Generating…</span>
      ) : idea.status === 'dismissed' ? (
        <span className="text-micro text-ink/50">Dismissed</span>
      ) : (
        <>
          <button
            onClick={() => onGenerate(idea)}
            className={GENERATE_BUTTON_CLASS}
            style={{ transition: 'background 0.15s' }}
          >
            <Zap size={12} />
            Generate from this idea
          </button>
          <button onClick={() => onDismiss(idea.id)} className={DISMISS_BUTTON_CLASS}>
            Dismiss
          </button>
        </>
      )}
    </div>
  )
}

function UnreadDot() {
  return <div className="w-[7px] h-[7px] rounded-full bg-spring-text shrink-0" />
}

function Separator() {
  // leading-[1.6] holds the line-height this span inherited from the body when it
  // only set a size; text-micro's own 1.35 would shorten the header row.
  return <span className="text-micro leading-[1.6] text-ink/20">·</span>
}

function PlatformPill({ label }: { label: string }) {
  return (
    <span className="text-label tracking-normal font-medium px-2 py-0.5 rounded-xs bg-spring/10 text-spring-text">
      {label}
    </span>
  )
}

// ── Styles ──────────────────────────────────────────────────

const CARD_CLASS = 'bg-surface border border-ink/12 rounded-md overflow-hidden'

// leading-[1.6] on both pills: they set only a size, so they kept the body's
// inherited line-height rather than text-label's own 1.2.
const META_PILL_CLASS =
  'text-label tracking-normal leading-[1.6] font-medium px-2 py-0.5 rounded-xs bg-ink/6 text-text2'

const GENERATED_BADGE_CLASS =
  'text-label tracking-normal leading-[1.6] font-medium px-2 py-0.5 rounded-xs bg-spring/10 text-spring-text inline-flex items-center gap-[3px]'

const FOOTER_CLASS = 'px-4 py-2.5 border-t border-t-ink/7 flex items-center gap-2 bg-sunken'

// leading-[1.6] on both buttons: preflight's `font: inherit` handed them the body
// line-height, which text-micro's 1.35 would otherwise tighten.
const GENERATE_BUTTON_CLASS =
  'px-4 py-[7px] bg-forest-deep text-ink-inv rounded-[7px] text-micro leading-[1.6] font-medium cursor-pointer flex items-center gap-[5px]'

const DISMISS_BUTTON_CLASS = 'text-micro leading-[1.6] font-medium text-ink/70 cursor-pointer'

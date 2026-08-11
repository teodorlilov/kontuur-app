'use client'

import { useState } from 'react'
import { AlertCircle, Check, ChevronDown, X, ExternalLink } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toSourceHost } from '@/utils/url'
import { StatusPill } from '@/components/ui/status-pill'
import { sourceTypeLabel } from '@/components/posts/source-tile'
import { RewriteButton } from '@/components/posts/rewrite-button'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import type { PostData, ValidationData } from '@/types/post'

interface InsightPanelProps {
  post: PostData
  validation: ValidationData
  rewriting: boolean
  onRewrite: () => void
  /** Surface-specific sections appended after the shared ones (the queue adds triage + post info). */
  extraSections?: React.ReactNode
}

/**
 * The focus layout's right panel — why this draft can be trusted: quality
 * dimensions with their failures, the source with its checked claims, and the
 * language-fix receipt. Built for this flow; the review queue keeps its own panel.
 */
export function InsightPanel({
  post,
  validation,
  rewriting,
  onRewrite,
  extraSections,
}: InsightPanelProps) {
  const { scores, slop, criteria, language, sourceGrounding } = validation
  // Unjudged is not low — but it is still worth offering the rewrite, since an
  // unchecked draft is exactly when a reviewer wants one.
  const unscored = scores.overall_score === null
  const low = scores.overall_score !== null && scores.overall_score < REWRITE_SCORE_THRESHOLD
  const lowAuthenticity =
    slop.human_authenticity_score !== null &&
    slop.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD
  // Diagnosis → treatment: the rewrite lives beside the findings it fixes.
  const showRewrite = lowAuthenticity || slop.ai_tells_found.length > 0 || low || unscored
  const [showFixes, setShowFixes] = useState(false)

  return (
    <aside className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
      {/* ── Quality ── */}
      <section className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-label font-semibold uppercase text-text2">Quality</h3>
          {/* A score is a stat value — sans Metric, never the serif. Unjudged is
              a fact, not a pass: the forest (pass) colour must never read over
              an absence. */}
          {unscored ? (
            <StatusPill tone="neutral">Not scored</StatusPill>
          ) : (
            <span
              className={cn(
                'text-metric font-semibold tabular-nums',
                low ? 'text-pending' : 'text-forest'
              )}
            >
              {scores.overall_score}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <ScoreBar label="Human" score={slop.human_authenticity_score} />
          <ScoreBar label="Language" score={scores.language_score} />
          {scores.source_score !== null && <ScoreBar label="Sources" score={scores.source_score} />}
        </div>

        {/* Treatment sits with the verdict: full-width under the scores so a
            weak draft shows its fix without scrolling — the panel runs past
            the fold and a button at its foot was invisible. Evidence follows. */}
        {showRewrite && (
          <div className="mt-4">
            <RewriteButton
              hasLowAuthenticity={lowAuthenticity}
              hasLowQuality={low}
              regenerating={rewriting}
              onClick={onRewrite}
              size="md"
              className="w-full"
            />
          </div>
        )}

        {slop.ai_tells_found.length > 0 && (
          <FlagGroup title="Sounds like AI">
            {slop.ai_tells_found.map((tell) => (
              <Flag key={tell} tone="warn">
                “{tell}”
                {tell === slop.worst_offending_phrase && (
                  <span className="font-medium text-ink"> — worst offender</span>
                )}
              </Flag>
            ))}
          </FlagGroup>
        )}

        {criteria.issues.length > 0 && (
          <FlagGroup title="Issues to fix">
            {criteria.issues.map((issue, i) => (
              <Flag key={i} tone="bad">
                <span className="font-medium text-ink">{issue.type.replaceAll('_', ' ')}:</span>{' '}
                {issue.description}
              </Flag>
            ))}
          </FlagGroup>
        )}

      </section>

      {/* ── Source ── */}
      {(post.source_title || post.source_excerpt) && (
        <section className="border-t border-line p-4">
          <h3 className="text-label font-semibold uppercase text-text2">Source</h3>
          {post.source_title && (
            <p className="mt-3 text-body font-medium text-ink">{post.source_title}</p>
          )}
          <p className="mt-1 truncate text-micro text-text3">
            {[sourceTypeLabel(post.source_type), toSourceHost(post.source_url)].filter(Boolean).join(' · ')}
          </p>

          {sourceGrounding?.flagged_claims.map((claim, i) => (
            <div key={i} className="mt-4 border-l border-line2 pl-3">
              <p className="text-caption text-ink">{claim.claim}</p>
              {claim.source_evidence && (
                <p className="mt-2 text-caption text-text2">{claim.source_evidence}</p>
              )}
              <p className="mt-2">
                <StatusPill tone={claim.status === 'grounded' ? 'ok' : 'warn'}>
                  {claim.status === 'grounded' ? 'Matched in source' : 'Partly in source — check it'}
                </StatusPill>
              </p>
            </div>
          ))}
          {!sourceGrounding?.flagged_claims.length && post.source_excerpt && (
            <p className="mt-3 text-caption leading-relaxed text-text2">{post.source_excerpt}</p>
          )}

          {post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-caption font-medium text-spring-text hover:underline"
            >
              <ExternalLink aria-hidden className="size-3" strokeWidth={1.8} />
              Open source
            </a>
          )}
        </section>
      )}

      {/* ── Language fixes — a receipt, not a warning: the pipeline already
          applied these corrections to the copy before it reached review. ── */}
      {language.issues.length > 0 && (
        <section className="border-t border-line p-4">
          <button
            type="button"
            aria-expanded={showFixes}
            onClick={() => setShowFixes((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Check aria-hidden className="size-3.5 flex-none text-forest" strokeWidth={2} />
            <span className="min-w-0 flex-1 text-caption text-text2">
              {language.issues.length} language fix{language.issues.length === 1 ? '' : 'es'} applied
              automatically
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3 flex-none text-text3 transition-transform duration-150 ease-contour',
                showFixes && 'rotate-180'
              )}
            />
          </button>
          {showFixes && (
            <div className="mt-3 flex flex-col gap-2">
              {language.issues.map((issue, i) => (
                <div key={i} className="rounded-sm bg-sunken p-2 text-micro text-text2">
                  <span className="mb-1 block text-label font-semibold uppercase text-text3">
                    {issue.type.replaceAll('_', ' ')}
                  </span>
                  {/* The diff carries the whole story — struck history, not danger. */}
                  <s className="text-text3">{issue.original_text}</s>{' '}
                  <span aria-hidden>→</span>{' '}
                  <span className="font-medium text-ink">{issue.suggested_fix}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {extraSections}
    </aside>
  )
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  // Unmeasured is neither weak nor strong. Coercing null here would paint a full
  // amber bar at scaleX(0) — a confident-looking verdict on a check that never ran.
  const weak = score !== null && score < REWRITE_SCORE_THRESHOLD
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 flex-none text-caption text-text2">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
        <span
          className={cn('block h-full origin-left rounded-full', weak ? 'bg-pending' : 'bg-forest')}
          // Width encodes the score — a genuinely computed value.
          style={{ transform: `scaleX(${score === null ? 0 : Math.max(0, Math.min(score, 10)) / 10})` }}
        />
      </span>
      <span
        className={cn(
          'w-5 flex-none text-right text-caption font-semibold tabular-nums',
          weak ? 'text-pending' : 'text-ink'
        )}
      >
        {score}
      </span>
    </div>
  )
}

function FlagGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="text-caption font-semibold text-text2">{title}</h4>
      <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Flag({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  const Icon = tone === 'bad' ? X : AlertCircle
  return (
    <p className="flex items-start gap-2 text-caption text-text2">
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-3 flex-none', tone === 'bad' ? 'text-danger' : 'text-pending')}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  )
}


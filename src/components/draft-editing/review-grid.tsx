'use client'

import { cn } from '@/utils/cn'
import { toSourceHost } from '@/utils/url'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { parseSlides } from '@/lib/posts/parse-slides'
import { sourceTypeLabel } from '@/components/posts/source-tile'
import { VisualFrame } from './visual-frame'
import { countVisualsByStatus, type DraftVisual } from '@/lib/visual/draft-visuals'
import { REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import type { ReviewDraft } from './types'

interface ReviewGridProps {
  drafts: ReviewDraft[]
  visualsByDraft: Record<string, DraftVisual[]>
  approvedCount: number
  discardedCount: number
  onOpen: (postId: string) => void
  onApprove: (postId: string) => void
}

/** The All layout: triage. Three answers per card — good? grounded? finished? */
export function ReviewGrid({
  drafts,
  visualsByDraft,
  approvedCount,
  discardedCount,
  onOpen,
  onApprove,
}: ReviewGridProps) {
  if (drafts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-display text-ink">Nothing left in this run.</p>
        <p className="mt-2 text-caption text-text2">
          {approvedCount} post{approvedCount === 1 ? '' : 's'} approved, {discardedCount} discarded.
        </p>
      </Card>
    )
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        // Sparse runs hug their content and centre on the terrain — auto-fill
        // kept phantom tracks open, pinning one or two cards into a corner of
        // reserved emptiness. Four-plus fills rows exactly as before.
        drafts.length <= 3
          ? 'grid-cols-[repeat(auto-fit,minmax(280px,420px))] justify-center'
          : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
      )}
    >
      {drafts.map((item) => (
        <DraftCard
          key={item.post.id}
          item={item}
          visuals={visualsByDraft[item.post.id]}
          onOpen={() => onOpen(item.post.id)}
          onApprove={() => onApprove(item.post.id)}
        />
      ))}
    </div>
  )
}

function DraftCard({
  item,
  visuals,
  onOpen,
  onApprove,
}: {
  item: ReviewDraft
  visuals: DraftVisual[] | undefined
  onOpen: () => void
  onApprove: () => void
}) {
  const { post, scores } = item
  const slides = parseSlides(post.slides_json)
  const title = post.topic_summary || slides[0]?.headline || post.caption?.slice(0, 80) || 'Draft'
  const excerpt = slides[1]?.headline || post.caption?.slice(0, 120) || ''
  const pillarColor = post.pillar ? getPillarColor(post.pillar) : null
  const low = scores.overall_score !== null && scores.overall_score < REWRITE_SCORE_THRESHOLD
  const { failed, composing } = countVisualsByStatus(visuals)
  const cover = visuals?.find((v) => v.position === 0)
  const slideCount = post.post_type === 'carousel' ? slides.length : 1

  return (
    <Card className="flex flex-col overflow-hidden transition-colors duration-150 ease-contour hover:border-line2">
      <button type="button" onClick={onOpen} className="relative block w-full text-left">
        <VisualFrame visual={cover} size="cover" alt={title} className="rounded-b-none" />
        {slideCount > 1 && (
          <span aria-hidden className="absolute left-3 top-3 flex gap-1">
            {Array.from({ length: slideCount }, (_, i) => (
              <i
                key={i}
                className={cn(
                  'h-[3px] w-3.5 rounded-full',
                  i === 0 ? 'bg-surface' : 'bg-surface/45'
                )}
              />
            ))}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {post.pillar && (
            <span
              className="inline-flex min-w-0 truncate rounded-chip px-2 py-0.5 text-micro font-medium"
              style={
                pillarColor ? { background: pillarColor.bg, color: pillarColor.text } : undefined
              }
            >
              {post.pillar}
            </span>
          )}
          <span className="ml-auto flex-none">
            {/* Unjudged is neutral, never the ok tone — a green "/10" over a null
                score read as a pass on a check that never ran. */}
            {scores.overall_score === null ? (
              <StatusPill tone="neutral">Not scored</StatusPill>
            ) : (
              <StatusPill tone={low ? 'warn' : 'ok'}>
                <span className="tabular-nums">{scores.overall_score}/10</span>
              </StatusPill>
            )}
          </span>
        </div>
        <button type="button" onClick={onOpen} className="text-left">
          <span className="block text-title font-semibold text-ink">{title}</span>
        </button>
        {excerpt && <p className="line-clamp-2 flex-1 text-caption text-text2">{excerpt}</p>}
        <div className="flex flex-wrap gap-1.5">
          {failed > 0 && (
            <StatusPill tone="bad">
              {failed} visual{failed === 1 ? '' : 's'} failed
            </StatusPill>
          )}
          {composing > 0 && (
            // In-progress is healthy, not a warning — wash + the live dot, the
            // same vocabulary the generating step speaks.
            <StatusPill tone="ok">
              <span
                aria-hidden
                className="live-dot mr-1.5 size-1.5 flex-none rounded-full bg-spring"
              />
              {composing} composing
            </StatusPill>
          )}
          {failed === 0 && composing === 0 && <StatusPill tone="ok">Visuals ready</StatusPill>}
          {low && <StatusPill tone="warn">Needs a rewrite</StatusPill>}
        </div>
        <div className="mt-1 flex items-center gap-2 border-t border-line pt-3">
          <span className="min-w-0 flex-1 truncate text-micro text-text3">
            {[sourceTypeLabel(post.source_type), toSourceHost(post.source_url)]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <Button variant="ghost" size="sm" className="text-text2" onClick={onOpen}>
            Open
          </Button>
          <Button size="sm" onClick={onApprove}>
            Approve
          </Button>
        </div>
      </div>
    </Card>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { parseSlides } from '@/components/posts/parse-slides'
import { VisualFrame } from './visual-frame'
import type { DraftVisual } from '@/lib/visual/draft-visuals'
import type { ReviewDraft } from './types'

interface DraftRailProps {
  posts: ReviewDraft[]
  approvedIds: Set<string>
  discardedIds: Set<string>
  visualsByDraft: Record<string, DraftVisual[]>
  focusedId: string
  onFocus: (postId: string) => void
}

/**
 * The focus layout's left rail: every draft of the run, including settled ones
 * greyed with their outcome — the rail is the run's ledger, not a to-do list.
 */
export function DraftRail({
  posts,
  approvedIds,
  discardedIds,
  visualsByDraft,
  focusedId,
  onFocus,
}: DraftRailProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const liveCount = posts.filter(
    (p) => !approvedIds.has(p.post.id) && !discardedIds.has(p.post.id)
  ).length

  // Keep the focused row in view as keyboard navigation moves it.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  return (
    <aside className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-label font-semibold uppercase text-text2">Drafts</span>
        <span className="text-micro tabular-nums text-text3">{liveCount} left</span>
      </div>
      <div ref={listRef}>
        {posts.map((item) => {
          const { post, scores } = item
          const settled = approvedIds.has(post.id)
            ? 'Approved'
            : discardedIds.has(post.id)
              ? 'Discarded'
              : null
          const title =
            post.topic_summary ||
            parseSlides(post.slides_json)[0]?.headline ||
            post.caption?.slice(0, 60) ||
            'Draft'
          const focused = post.id === focusedId
          return (
            <button
              key={post.id}
              type="button"
              aria-current={focused || undefined}
              onClick={() => onFocus(post.id)}
              className={cn(
                'relative flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0',
                'transition-colors duration-150 ease-contour hover:bg-sunken',
                focused && 'bg-wash hover:bg-wash',
                settled && 'opacity-60'
              )}
            >
              {/* Deep Pine, not lime: a rule this thin on a light ground would
                  measure 1.35:1 in lime — the tab-rail case DESIGN.md rejects. */}
              {focused && <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-forest" />}
              <span className="w-8 flex-none">
                <VisualFrame
                  visual={visualsByDraft[post.id]?.find((v) => v.position === 0)}
                  size="thumb"
                  alt=""
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'line-clamp-2 block text-caption font-semibold',
                    focused ? 'text-ink' : 'text-text2'
                  )}
                >
                  {title}
                </span>
                {/* Requested posts have no pillar by design (they sit outside the
                    rotation) — showing the 'General' fallback there mislabelled
                    exactly the drafts with a special origin. */}
                <span
                  className={cn(
                    'mt-1 block truncate text-micro',
                    !settled && post.priority ? 'font-semibold text-forest' : 'text-text3'
                  )}
                >
                  {settled ?? (post.priority ? 'Client idea' : (post.pillar ?? 'General'))}
                </span>
              </span>
              <span
                className={cn(
                  'flex-none text-caption font-semibold tabular-nums',
                  // Neutral ink for an unjudged draft — forest is the pass colour,
                  // and a blank green slot read as a score that never rendered.
                  settled
                    ? 'text-spring-text'
                    : scores.overall_score === null
                      ? 'text-text3'
                      : 'text-forest'
                )}
                {...(!settled && scores.overall_score === null
                  ? { 'aria-label': 'Not scored' }
                  : {})}
              >
                {settled ? (
                  <Check aria-hidden className="size-3.5" strokeWidth={2.2} />
                ) : (
                  (scores.overall_score ?? '—')
                )}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

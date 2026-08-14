'use client'

import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Spinner } from '@/components/ui/spinner'
import { StatusPill } from '@/components/ui/status-pill'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { parseSlides } from '@/components/posts/parse-slides'
import { ORDERED_STAGE_LABELS } from '@/features/generate/lib/stages'
import { REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import type { ReviewDraft } from '@/components/posts/review/types'
import type { PostType } from '@/types/api'

interface GeneratingViewProps {
  clientName: string
  postType: PostType
  stage: number
  researchPhase: string
  streamTotal: number
  targetPostCount: number
  posts: ReviewDraft[]
}

/**
 * Step 2 — the run in motion. Stacked phase boxes narrate the pipeline; the
 * landing list appears once writing begins, and each post fills its slot the
 * moment its copy streams in — pending slots hold their height with skeleton
 * lines so arrivals move nothing.
 */
export function GeneratingView({
  clientName,
  postType,
  stage,
  researchPhase,
  streamTotal,
  targetPostCount,
  posts,
}: GeneratingViewProps) {
  const expected = Math.max(streamTotal || targetPostCount || 1, posts.length)
  const noun = postType === 'carousel' ? 'carousel' : 'post'
  // The landing list earns its place only once writing begins — before that it
  // could only echo the phase boxes and claim "0 written" for minutes.
  const writingBegun = stage >= 2

  return (
    <div className="rv mx-auto w-full max-w-[760px] px-4 py-6 md:px-8">
      <header>
        <h1 className="text-headline font-semibold text-ink">
          Writing {expected} {noun}
          {expected === 1 ? '' : 's'} for {clientName}
        </h1>
        <p className="mt-1 text-caption text-text2">
          Research, drafting, visuals and quality checks. Each post appears the moment it lands.
        </p>
      </header>

      {/* The pipeline, one box per phase: done phases settle, the active one
          carries the stream's own words, waiting ones hold their place. */}
      <div className="my-6 flex flex-col gap-2">
        {ORDERED_STAGE_LABELS.map((label, i) => (
          <PhaseBox
            key={label}
            label={label}
            state={i < stage ? 'done' : i === stage ? 'active' : 'waiting'}
            activity={i === stage ? researchPhase : ''}
          />
        ))}
      </div>

      {writingBegun && (
        <>
          <p className="mb-4 flex items-baseline gap-2">
            <span className="text-metric font-semibold tabular-nums text-ink">{posts.length}</span>
            <span className="text-caption text-text2">of {expected} written</span>
          </p>

          <div className="flex flex-col gap-3">
            {Array.from({ length: expected }, (_, i) => {
              const item = posts[i]
              return item ? (
                <ArrivedCard key={item.post.id} index={i} item={item} />
              ) : (
                <PendingCard
                  key={`pending-${i}`}
                  index={i}
                  // The next slot to fill carries the live treatment; the ones
                  // behind it wait quietly.
                  live={i === posts.length}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Strips the server's "Writing: " prefix into readable copy. */
function formatPhase(phase: string): string {
  return phase.startsWith('Writing: ') ? `Writing — ${phase.slice('Writing: '.length)}` : phase
}

function PhaseBox({
  label,
  state,
  activity,
}: {
  label: string
  state: 'done' | 'active' | 'waiting'
  activity: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-panel border px-4 py-3 transition-colors duration-300 ease-contour',
        state === 'active'
          ? 'border-forest bg-wash'
          : state === 'done'
            ? 'border-ink/[0.05] bg-surface'
            : 'border-dashed border-line2'
      )}
    >
      <span
        className={cn(
          'grid size-6 flex-none place-items-center rounded-full',
          state === 'done'
            ? 'bg-wash text-forest'
            : state === 'active'
              ? 'bg-forest text-white'
              : 'bg-sunken'
        )}
      >
        {state === 'done' && <Check aria-hidden className="size-3" strokeWidth={2.4} />}
        {/* h/w rather than size-*: they conflict 1:1 with the Spinner's own
            h-4 w-4, so tailwind-merge reliably lets these win. */}
        {state === 'active' && <Spinner size="sm" className="h-3 w-3 text-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-body font-medium',
            state === 'active' ? 'text-ink' : state === 'done' ? 'text-text2' : 'text-text3'
          )}
        >
          {label}
        </span>
        {/* The stream's own words — which source, which theme — live in the
            active box rather than a separate ticker. */}
        {state === 'active' && activity && (
          <span className="mt-0.5 flex items-center gap-2 text-caption text-text2">
            <span aria-hidden className="live-dot size-1.5 flex-none rounded-full bg-spring" />
            <span className="truncate">{formatPhase(activity)}</span>
          </span>
        )}
      </span>
    </div>
  )
}

function PendingCard({ index, live }: { index: number; live: boolean }) {
  // No stage chip — the phase boxes narrate the run. The next slot to fill
  // carries the one live marker; the rest are quiet held space.
  return (
    <div className="flex items-start gap-4 rounded-panel border border-dashed border-line2 px-5 py-4">
      <span className="grid size-7 flex-none place-items-center rounded-chip bg-sunken text-micro font-semibold tabular-nums text-text2">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-chip bg-wash px-2 py-0.5 text-micro font-medium text-forest">
            <span aria-hidden className="live-dot size-1.5 flex-none rounded-full bg-spring" />
            Writing
          </span>
        )}
        <div className={cn('skeleton h-2 w-[70%]', live ? 'mt-3' : 'mt-1.5')} />
        <div className="skeleton mt-2 h-2 w-[45%]" />
      </div>
    </div>
  )
}

function ArrivedCard({ index, item }: { index: number; item: ReviewDraft }) {
  const { post, scores } = item
  const slides = parseSlides(post.slides_json)
  const title = post.topic_summary || slides[0]?.headline || post.caption?.slice(0, 80) || 'Draft'
  const excerpt = slides[1]?.headline || post.caption?.slice(0, 120) || ''
  const pillarColor = post.pillar ? getPillarColor(post.pillar) : null
  const low = scores.overall_score !== null && scores.overall_score < REWRITE_SCORE_THRESHOLD

  return (
    // One authored moment on this view: a post lands as a clearing cut into
    // the terrain. Nothing else on the screen moves.
    <div className="flex animate-[rv-in_0.45s_var(--ease-contour)_both] items-start gap-4 rounded-panel border border-ink/[0.05] bg-surface px-5 py-4">
      <span className="grid size-7 flex-none place-items-center rounded-chip bg-wash text-micro font-semibold tabular-nums text-forest">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {post.pillar && (
          <span
            className="inline-flex rounded-chip px-2 py-0.5 text-micro font-medium"
            // Identity tint + darkened ink — computed, the palette is a token list.
            style={pillarColor ? { background: pillarColor.bg, color: pillarColor.text } : undefined}
          >
            {post.pillar}
          </span>
        )}
        <p className="mt-1.5 text-title font-semibold text-ink">{title}</p>
        {excerpt && <p className="mt-1.5 line-clamp-2 text-caption text-text2">{excerpt}</p>}
      </div>
      <div className="flex-none text-right">
        {/* A large numeral must never render blank, and forest (the pass colour)
            must never read over an absence. */}
        {scores.overall_score === null ? (
          <StatusPill tone="neutral">Not scored</StatusPill>
        ) : (
          <>
            <p
              className={cn(
                'text-headline font-semibold leading-none tabular-nums',
                low ? 'text-pending' : 'text-forest'
              )}
            >
              {scores.overall_score}
            </p>
            <p className="mt-1 text-label font-semibold uppercase text-text3">quality</p>
          </>
        )}
      </div>
    </div>
  )
}

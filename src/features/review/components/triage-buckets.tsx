'use client'

import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { parseSlides } from '@/components/posts/parse-slides'
import { VisualFrame } from '@/components/posts/review/visual-frame'
import {
  AGE_WARN_DAYS,
  TRIAGE_REASON_LABELS,
  type TriageBucket,
  type TriagedPost,
} from '@/features/review/lib/triage'
import type { QueuePost } from '@/features/review/lib/queue-post'
import type { DraftVisual } from '@/lib/visual/draft-visuals'

interface TriageBucketsProps {
  bucket: TriageBucket
  items: TriagedPost[]
  visualsByPost: Record<string, DraftVisual[]>
  /** The queue's pinned render instant — keeps SSR and hydration text identical. */
  now: Date
  onOpen: (postId: string) => void
  onApprove: (postId: string) => void
  onScheduleAll: () => void
  /** Re-send the approval link for a waiting post (reissues the token). */
  onRemind: (postId: string) => void
}

function postTitle(post: QueuePost): string {
  return (
    post.topic_summary ||
    parseSlides(post.slides_json)[0]?.headline ||
    post.caption?.slice(0, 80) ||
    'Post'
  )
}

function AgeChip({ ageDays }: { ageDays: number }) {
  const label = ageDays === 0 ? 'today' : `waiting ${ageDays}d`
  return (
    <span
      className={cn(
        'text-micro tabular-nums',
        ageDays > AGE_WARN_DAYS ? 'font-semibold text-pending' : 'text-text3'
      )}
    >
      {label}
    </span>
  )
}

function ScorePill({ score }: { score: number | null }) {
  // Absence alone reads as a layout gap beside scored siblings — state the fact.
  if (score === null) return <StatusPill tone="neutral">Not scored</StatusPill>
  return (
    <StatusPill tone={score < 7 ? 'warn' : 'ok'}>
      <span className="tabular-nums">{score}/10</span>
    </StatusPill>
  )
}

/**
 * The bucket lists — one bucket per tab. Needs-attention posts state their
 * reasons; ready posts are compact rows behind one bulk action; waiting rows
 * show where the client stands. Oldest first everywhere: a queue drains.
 */
export function TriageBuckets({
  bucket,
  items,
  visualsByPost,
  now,
  onOpen,
  onApprove,
  onScheduleAll,
  onRemind,
}: TriageBucketsProps) {
  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-display text-ink">
          {bucket === 'needs_attention'
            ? 'Nothing needs your attention.'
            : bucket === 'ready'
              ? 'Nothing waiting to ship.'
              : 'Nothing is out with clients.'}
        </p>
        <p className="mt-2 text-caption text-text2">
          Posts land here as autonomous generation runs.
        </p>
      </Card>
    )
  }

  if (bucket === 'ready') {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-text2">
            Clean scores, grounded, nothing flagged — review is optional here.
          </p>
          <Button size="sm" onClick={onScheduleAll}>
            Approve {items.length} → schedule
          </Button>
        </div>
        <div className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
          {items.map(({ post, ageDays }) => (
            <div
              key={post.id}
              className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onOpen(post.id)}
                aria-label={`Open ${postTitle(post)}`}
                className="w-10 flex-none"
              >
                <VisualFrame
                  visual={visualsByPost[post.id]?.find((v) => v.position === 0)}
                  size="thumb"
                  alt=""
                />
              </button>
              <span className="w-28 flex-none truncate text-micro font-semibold text-text2">
                {post.client_name}
              </span>
              <button
                type="button"
                onClick={() => onOpen(post.id)}
                className="min-w-0 flex-1 truncate text-left text-body font-medium text-ink hover:underline"
              >
                {postTitle(post)}
              </button>
              <AgeChip ageDays={ageDays} />
              <ScorePill score={post.quality_score_avg} />
              <Button
                variant="ghost"
                size="sm"
                className="text-text2"
                onClick={() => onApprove(post.id)}
              >
                Approve
              </Button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (bucket === 'waiting_on_client') {
    return (
      <div className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
        {items.map(({ post }) => (
          <div
            key={post.id}
            className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
          >
            <span className="w-10 flex-none">
              <VisualFrame
                visual={visualsByPost[post.id]?.find((v) => v.position === 0)}
                size="thumb"
                alt=""
              />
            </span>
            <span className="w-28 flex-none truncate text-micro font-semibold text-text2">
              {post.client_name}
            </span>
            <button
              type="button"
              onClick={() => onOpen(post.id)}
              className="min-w-0 flex-1 truncate text-left text-body font-medium text-ink hover:underline"
            >
              {postTitle(post)}
            </button>
            {post.approval && (
              <StatusPill tone="warn">
                {/* Expiry is a FUTURE instant — formatRelativeTime only reads the
                    past ("just now" for anything ahead), so count the hours left. */}
                Sent · expires in{' '}
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(post.approval.expiresAt).getTime() - now.getTime()) / 3_600_000
                  )
                )}
                h
              </StatusPill>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-text2"
              onClick={() => onRemind(post.id)}
            >
              Remind
            </Button>
          </div>
        ))}
        <p className="border-t border-line px-4 py-2.5 text-micro text-text3">
          Clients approve from a link — no login. Their answer arrives as a notification.
        </p>
      </div>
    )
  }

  // needs_attention — the judgment bucket: every card says why it is here.
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(({ post, reasons, ageDays }) => {
        const pillarColor = post.pillar ? getPillarColor(post.pillar) : null
        return (
          <div
            key={post.id}
            className="flex items-start gap-4 rounded-card border border-ink/[0.05] bg-surface p-4 transition-colors duration-150 ease-contour hover:border-line2"
          >
            <button
              type="button"
              onClick={() => onOpen(post.id)}
              aria-label={`Open ${postTitle(post)}`}
              className="w-16 flex-none"
            >
              <VisualFrame
                visual={visualsByPost[post.id]?.find((v) => v.position === 0)}
                size="thumb"
                alt=""
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-text3">
                <span className="font-semibold text-text2">{post.client_name}</span>
                {post.pillar && (
                  <span
                    className="inline-flex min-w-0 truncate rounded-chip px-2 py-0.5 font-medium"
                    style={
                      pillarColor
                        ? { background: pillarColor.bg, color: pillarColor.text }
                        : undefined
                    }
                  >
                    {post.pillar}
                  </span>
                )}
                <span>{[post.platform, post.post_type].filter(Boolean).join(' · ')}</span>
                <AgeChip ageDays={ageDays} />
              </div>
              <button
                type="button"
                onClick={() => onOpen(post.id)}
                className="mt-1 block text-left text-title font-semibold text-ink hover:underline"
              >
                {postTitle(post)}
              </button>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <StatusPill key={reason} tone={reason === 'missing_visuals' ? 'bad' : 'warn'}>
                    {TRIAGE_REASON_LABELS[reason]}
                  </StatusPill>
                ))}
              </div>
            </div>
            <div className="flex flex-none flex-col items-end gap-2.5">
              <ScorePill score={post.quality_score_avg} />
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-text2"
                  onClick={() => onOpen(post.id)}
                >
                  Open
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onApprove(post.id)}>
                  Approve
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

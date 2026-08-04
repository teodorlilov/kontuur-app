import { parseSlides } from '@/components/posts/parse-slides'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import { STALE_REVIEW_DAYS } from '@/utils/constants'
import type { ValidationData } from '@/types/post'
import type { QueuePost } from './queue-post'

export type TriageReason =
  | 'low_quality'
  | 'ai_tells'
  | 'health_review'
  | 'stale_source'
  | 'missing_visuals'

export type TriageBucket = 'needs_attention' | 'ready' | 'waiting_on_client'

export interface TriagedPost {
  post: QueuePost
  validation: ValidationData
  bucket: TriageBucket
  reasons: TriageReason[]
  ageDays: number
}

/** Age chips turn amber past this — the queue is starting to silt up. */
export const AGE_WARN_DAYS = 5

/** Reviewer-facing copy for the reason chips — one source for cards and the insight panel. */
export const TRIAGE_REASON_LABELS: Record<TriageReason, string> = {
  low_quality: 'Low quality score',
  ai_tells: 'Sounds like AI',
  health_review: 'Health client — verify claims',
  stale_source: 'Source may be outdated',
  missing_visuals: 'Visuals missing',
}

const MS_PER_DAY = 86_400_000

export function postAgeDays(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY)
}

/** Every slot the post is supposed to fill — carousels one per slide, singles one. */
export function totalVisualSlots(post: Pick<QueuePost, 'post_type' | 'slides_json'>): number {
  return post.post_type === 'carousel' ? parseSlides(post.slides_json).length : 1
}

function reasonsFor(post: QueuePost, validation: ValidationData, ageDays: number): TriageReason[] {
  const reasons: TriageReason[] = []
  const { scores, slop, criteria } = validation

  if (
    scores.overall_score < REWRITE_SCORE_THRESHOLD ||
    (post.quality_score_avg !== null && post.quality_score_avg < REWRITE_SCORE_THRESHOLD)
  ) {
    reasons.push('low_quality')
  }
  // A 0 authenticity score means "not measured yet" (legacy row awaiting the
  // detect-slop fallback) — only a measured-low score flags the post.
  if (
    slop.ai_tells_found.length > 0 ||
    (slop.human_authenticity_score > 0 &&
      slop.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD)
  ) {
    reasons.push('ai_tells')
  }
  if (post.is_health_niche && criteria.health_compliant !== true) {
    reasons.push('health_review')
  }
  // The source's own publish date is not stored, so post age approximates it:
  // a sourced post that sat a week is reviewed against a week-old source.
  if (post.source_url && ageDays > STALE_REVIEW_DAYS) {
    reasons.push('stale_source')
  }
  if (post.images.length < totalVisualSlots(post)) {
    reasons.push('missing_visuals')
  }
  return reasons
}

/**
 * The queue's sorting brain: waiting-on-client wins (the decision is with the
 * client, not the reviewer), any reason lands in needs_attention, the rest is
 * ready to ship. Within a bucket priority posts lead and the oldest drains
 * first — a queue, not a feed.
 */
export function computeTriage(
  items: Array<{ post: QueuePost; validation: ValidationData }>,
  now: Date
): TriagedPost[] {
  return items
    .map(({ post, validation }) => {
      const ageDays = postAgeDays(post.created_at, now)
      const waiting =
        post.approval?.status === 'pending' && new Date(post.approval.expiresAt) > now
      const reasons = reasonsFor(post, validation, ageDays)
      const bucket: TriageBucket = waiting
        ? 'waiting_on_client'
        : reasons.length > 0
          ? 'needs_attention'
          : 'ready'
      return { post, validation, bucket, reasons, ageDays }
    })
    .sort((a, b) => {
      if (a.post.priority !== b.post.priority) return a.post.priority ? -1 : 1
      return new Date(a.post.created_at).getTime() - new Date(b.post.created_at).getTime()
    })
}

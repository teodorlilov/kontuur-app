import type { PostImage } from '@/types/api'
import type { ValidationData } from '@/types/post'
import type { PostRow } from '@/types'

/** A client sign-off request attached to a queue post (post_approval_tokens). */
export interface QueueApproval {
  status: 'pending' | 'approved' | 'changes_requested'
  expiresAt: string
}

/** One pending_review post as the queue page loads it — the shell's data contract. */
export type QueuePost = Pick<
  PostRow,
  | 'id'
  | 'client_id'
  | 'caption'
  | 'platform'
  | 'post_type'
  | 'status'
  | 'priority'
  | 'quality_score_avg'
  | 'was_rewritten'
  | 'rewrite_count'
  | 'pillar'
  | 'source_url'
  | 'source_title'
  | 'source_type'
  | 'source_excerpt'
  | 'topic_summary'
  | 'scheduled_at'
  | 'created_at'
> & {
  slides_json: unknown
  /** The raw blob stays server-side (the page adapts it); null here keeps the
   *  shape assignable to PostData without shipping legacy JSON to the client. */
  validation_json: null
  /** Adapted server-side — the client never parses (or bundles) the zod schema. */
  validation: ValidationData
  /** True for legacy rows whose authenticity was never measured — the shell
   *  runs one detect-slop call on focus for these. */
  needsSlopCheck: boolean
  client_name: string
  is_health_niche: boolean
  images: PostImage[]
  /** Positions whose text overlay is already baked (a canvas doc exists). */
  composedPositions: number[]
  approval: QueueApproval | null
}

/** "Carousel · 6 slides" or "Single image" — the format label both queue leaves show. */
export function postTypeLabel(postType: string, slides: unknown): string {
  if (postType !== 'carousel') return 'Single image'
  const count = Array.isArray(slides) ? slides.length : 0
  return `Carousel · ${count} slides`
}

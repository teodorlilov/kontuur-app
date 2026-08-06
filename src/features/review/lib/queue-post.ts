import type { PostImage } from '@/types/api'
import type { ValidationData } from '@/types/post'

/** A client sign-off request attached to a queue post (post_approval_tokens). */
export interface QueueApproval {
  status: 'pending' | 'approved' | 'changes_requested'
  expiresAt: string
}

/** One pending_review post as the queue page loads it — the shell's data contract. */
export interface QueuePost {
  id: string
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  /** The raw blob stays server-side (the page adapts it); null here keeps the
   *  shape assignable to PostData without shipping legacy JSON to the client. */
  validation_json: null
  /** Adapted server-side — the client never parses (or bundles) the zod schema. */
  validation: ValidationData
  /** True for legacy rows whose authenticity was never measured — the shell
   *  runs one detect-slop call on focus for these. */
  needsSlopCheck: boolean
  status: string
  priority: boolean
  quality_score_avg: number | null
  was_rewritten: boolean
  rewrite_count: number
  pillar: string | null
  source_url: string | null
  source_title: string | null
  source_type: string | null
  source_excerpt: string | null
  topic_summary: string | null
  scheduled_at: string | null
  created_at: string
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

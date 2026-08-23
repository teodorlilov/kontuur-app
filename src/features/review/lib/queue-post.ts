import type { PostImage } from '@/types/api'
import type { ValidationData } from '@/types/api'
import type { PostColumns } from '@/lib/queries/select-columns'

/** A client sign-off request attached to a queue post (post_approval_tokens). */
export interface QueueApproval {
  status: 'pending' | 'approved' | 'changes_requested'
  expiresAt: string
}

/**
 * One pending_review post as the queue page loads it — the shell's data contract.
 *
 * Derived from `PostColumns` (what the page's select actually returns) minus the three
 * columns the client has no use for, rather than restating the other eighteen. The
 * restated version was the third copy of that list, and the `Omit` now says something
 * the `Pick` could not: these are deliberately withheld, not forgotten.
 *
 * `slides_json` and `validation_json` are re-declared below because both are narrowed.
 */
export type QueuePost = Omit<
  PostColumns,
  'image_url' | 'published_at' | 'client_source_id' | 'slides_json' | 'validation_json'
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

import type { PostColumns } from '@/lib/queries/select-columns'
import type { EditorialPost } from '@/lib/posts/fetch-editorial-posts'

/** A client sign-off request attached to a queue post (post_approval_tokens). */
export interface QueueApproval {
  status: 'pending' | 'approved' | 'changes_requested'
  expiresAt: string
}

/**
 * One pending_review post as the queue page loads it — the shell's data contract.
 *
 * The row is `PostColumns` (what the page's select actually returns) minus the three columns
 * the client has no use for, rather than a restated list — the `Omit` says these are
 * deliberately withheld, not forgotten. The evidence beside it — adapted validation, the slop
 * flag, images, composed positions — is the shared editorial read's (`EditorialPost`), so the
 * queue cannot describe those four differently from the generate flow. `slides_json` and
 * `validation_json` are re-declared because both are narrowed.
 */
export type QueuePost = Omit<
  PostColumns,
  'image_url' | 'published_at' | 'client_source_id' | 'slides_json' | 'validation_json'
> &
  Omit<EditorialPost, 'post'> & {
    slides_json: unknown
    /** The raw blob stays server-side (the page adapts it); null here keeps the
     *  shape assignable to PostData without shipping legacy JSON to the client. */
    validation_json: null
    /** Where this post can go — see `CalendarPost.destinations`. */
    destinations: string[]
    client_name: string
    is_health_niche: boolean
    approval: QueueApproval | null
  }

/** "Carousel · 6 slides" or "Single image" — the format label both queue leaves show. */
export function postTypeLabel(postType: string, slides: unknown): string {
  if (postType !== 'carousel') return 'Single image'
  const count = Array.isArray(slides) ? slides.length : 0
  return `Carousel · ${count} slides`
}

import { parseSlides } from '@/lib/posts/parse-slides'
import type { PostImage } from '@/types/api'
import type { PostRow } from '@/types'

/**
 * Every slot a post is supposed to FILL — carousels one per slide, singles one.
 *
 * Deliberately NOT `slideTotal` (features/canvas-editor/lib/slide-copy.ts), which floors at 1. The
 * two look like the same function and are not: a carousel with no slides has one slide to EDIT — the
 * editor must always have something to open — and zero visuals to GENERATE, because there is no copy
 * to make a picture from. Flooring here would give the cron a slot it can never fill and a post that
 * never finishes. Kept apart on purpose; see the note on `slideTotal`.
 */
export function totalVisualSlots(post: { post_type: string; slides_json: unknown }): number {
  return post.post_type === 'carousel' ? parseSlides(post.slides_json).length : 1
}

export type BacklogPost = Pick<
  PostRow,
  | 'id'
  | 'client_id'
  | 'post_type'
  | 'quality_score_avg'
  | 'visuals_attempts'
  | 'visuals_attempted_at'
  | 'created_at'
> & {
  slides_json: unknown
}

interface VisualJob {
  postId: string
  clientId: string
  positions: number[]
}

/**
 * The visuals cron's work order: which missing slide images to paint this
 * run. Oldest posts first (the queue drains), gated by the quality floor
 * (likely-discards get no art spend) and a per-post attempt cap so a post
 * whose generations keep failing cannot eat every run. The image budget is a
 * hard per-run ceiling; the cron's time budget cuts on top of it.
 *
 * `retrySpacingMs` is what makes the attempt cap mean "this post cannot be
 * painted" rather than "the provider was down for three ticks": without a gap
 * between attempts, an outage shorter than a morning exhausts the whole backlog's
 * budget and excludes those posts from auto-visuals permanently.
 */
export function pickVisualBacklog(
  posts: BacklogPost[],
  imagesByPost: Map<string, PostImage[]>,
  options: {
    qualityFloor: number
    maxAttempts: number
    maxImagesPerRun: number
    retrySpacingMs: number
  },
  now: Date = new Date()
): VisualJob[] {
  const jobs: VisualJob[] = []
  let budget = options.maxImagesPerRun
  const retryCutoff = now.getTime() - options.retrySpacingMs

  const ordered = [...posts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  for (const post of ordered) {
    if (budget <= 0) break
    // Unjudged posts pass the floor — see the cron's matching `.or(...)`. `?? 0`
    // would put them below every floor, conflating "not measured" with "measured
    // terrible".
    if (post.quality_score_avg !== null && post.quality_score_avg < options.qualityFloor) continue
    if (post.visuals_attempts >= options.maxAttempts) continue
    // A never-attempted post has no gap to wait out. An unparseable stamp yields NaN,
    // and NaN > x is false, so it reads as "long enough ago" — the safe direction here,
    // since the attempt cap still bounds it.
    if (post.visuals_attempted_at !== null) {
      if (new Date(post.visuals_attempted_at).getTime() > retryCutoff) continue
    }

    const covered = new Set((imagesByPost.get(post.id) ?? []).map((image) => image.position))
    const positions: number[] = []
    for (let position = 0; position < totalVisualSlots(post); position++) {
      if (covered.has(position)) continue
      if (positions.length >= budget) break
      positions.push(position)
    }
    if (positions.length === 0) continue

    budget -= positions.length
    jobs.push({ postId: post.id, clientId: post.client_id, positions })
  }
  return jobs
}

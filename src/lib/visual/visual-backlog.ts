import { parseSlides } from '@/components/posts/parse-slides'
import type { PostImage } from '@/types/api'
import type { PostRow } from '@/types'

/** Every slot a post is supposed to fill — carousels one per slide, singles one. */
export function totalVisualSlots(post: { post_type: string; slides_json: unknown }): number {
  return post.post_type === 'carousel' ? parseSlides(post.slides_json).length : 1
}

export type BacklogPost = Pick<
  PostRow,
  'id' | 'client_id' | 'post_type' | 'quality_score_avg' | 'visuals_attempts' | 'created_at'
> & {
  slides_json: unknown
}

export interface VisualJob {
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
 */
export function pickVisualBacklog(
  posts: BacklogPost[],
  imagesByPost: Map<string, PostImage[]>,
  options: { qualityFloor: number; maxAttempts: number; maxImagesPerRun: number }
): VisualJob[] {
  const jobs: VisualJob[] = []
  let budget = options.maxImagesPerRun

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

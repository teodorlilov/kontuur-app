import { parseSlides } from '@/lib/posts/parse-slides'
import { QUALITY_FLOOR } from '@/utils/constants'
import type { PostImage, PostType } from '@/types/api'
import type { PostRow } from '@/types'

/** How many failed attempts a post gets at its pictures before the visuals cron leaves it. */
export const MAX_VISUAL_ATTEMPTS = 3

/**
 * What one post of this format costs in pictures: a slide each, or one for a single image.
 *
 * Taken before a row exists, by whoever is about to decide a run — the wizard from the format
 * being chosen, the generate cron from the client's brand profile — so that what a post costs the
 * image allowance is answered the same way whether it is a plan or a post
 * (`postsAffordable`, lib/billing/post-allowance.ts).
 */
export function visualSlots(postType: string, slideCount: number): number {
  return postType === 'carousel' ? slideCount : 1
}

/**
 * A stored post type as the app's `PostType`: 'carousel' is a carousel, and anything else — a null
 * brand default, a value this bundle does not know — is a single, the reading `visualSlots` gives
 * it when costing a post. The one conversion from a stored value to the union.
 */
export function toPostType(value: string | null | undefined): PostType {
  return value === 'carousel' ? 'carousel' : 'single'
}

/**
 * Every slot a post is supposed to FILL — carousels one per slide, singles one.
 *
 * Deliberately NOT `slideTotal` (lib/posts/slide-copy.ts), which floors at 1. The
 * two look like the same function and are not: a carousel with no slides has one slide to EDIT — the
 * editor must always have something to open — and zero visuals to GENERATE, because there is no copy
 * to make a picture from. Flooring here would give the cron a slot it can never fill and a post that
 * never finishes. Kept apart on purpose; see the note on `slideTotal`.
 */
export function totalVisualSlots(post: { post_type: string; slides_json: unknown }): number {
  return visualSlots(post.post_type, parseSlides(post.slides_json).length)
}

/**
 * AI art as it leaves the model: a `visual-*` file, which is what `generatePostVisual` names every
 * picture it makes (lib/visual/generate-post-visual.ts). A flattened slide is written as
 * `slide-N.jpg` by `savePostCanvas`, and a person's own upload keeps its own name — so this is
 * the one question "does this picture still owe its text?" is asked through.
 */
export function isUnbakedArt(image: PostImage): boolean {
  return image.fileName?.startsWith('visual-') === true
}

/**
 * The images a surface bakes over on open — the cron's pictures in the queue, an interrupted run's
 * on resume. A position that already carries a canvas doc is left alone: its text is on it, and
 * re-baking would undo whatever was done to it in the editor.
 */
export function unbakedImages(images: PostImage[], composedPositions: number[]): PostImage[] {
  const composed = new Set(composedPositions)
  return images.filter((image) => isUnbakedArt(image) && !composed.has(image.position))
}

/**
 * The slide positions a post still owes a picture for, in slide order. A position held by a live
 * claim (`generatingPositions`, lib/visual/visual-jobs.ts) is owed by nobody: its picture is being
 * made, and its image is already reserved.
 */
export function missingPositions(
  post: { post_type: string; slides_json: unknown },
  images: PostImage[],
  generatingPositions: number[] = []
): number[] {
  const covered = new Set([...images.map((image) => image.position), ...generatingPositions])
  const positions: number[] = []
  for (let position = 0; position < totalVisualSlots(post); position++) {
    if (!covered.has(position)) positions.push(position)
  }
  return positions
}

export type BacklogPost = Pick<
  PostRow,
  | 'id'
  | 'client_id'
  | 'status'
  | 'post_type'
  | 'quality_score_avg'
  | 'visuals_attempts'
  | 'visuals_attempted_at'
  | 'created_at'
> & {
  slides_json: unknown
}

/**
 * Whether a post in the review queue will still be painted: at or above the quality floor
 * (likely discards get no art spend) and with attempts left. A post never judged passes the floor
 * — the judge failing is not the post failing — as does the backlog read's matching `.or(...)`
 * (`readPostVisualPages`, src/lib/visual/post-visuals.ts).
 * The one rule for what the cron will paint and what the owed-images count expects it to
 * (lib/visual/owed-images.ts).
 */
export function isStillPaintable(
  post: Pick<BacklogPost, 'quality_score_avg' | 'visuals_attempts'>
): boolean {
  const score = post.quality_score_avg
  if (score !== null && score < QUALITY_FLOOR) return false
  return post.visuals_attempts < MAX_VISUAL_ATTEMPTS
}

/** A post the visuals cron will paint, and the positions it still owes. */
export interface VisualJob {
  postId: string
  clientId: string
  positions: number[]
}

/**
 * The visuals cron's work order, oldest first: each `isStillPaintable` post picked WHOLE (every
 * position `missingPositions` says it owes) or not at all, though the time budget may stop it
 * partway for the next tick. A post over the run's image budget is passed over for a smaller one
 * behind it; one over its workspace's pool (`imagesLeft` via `agencyOf`, absent meaning nothing
 * left) is `refused`. An unparseable attempt stamp reads as past `retrySpacingMs`, which the
 * attempt cap still bounds. The time budget, the count and bell for `refused`, and why attempts
 * are spaced: `paintBacklog`, `selectPaintableBacklog` with `ringImagesWaiting`, and
 * `RETRY_SPACING_MS` (src/lib/visual/paint-backlog.ts).
 */
export function pickVisualBacklog(
  posts: BacklogPost[],
  imagesByPost: Map<string, PostImage[]>,
  options: {
    maxImagesPerRun: number
    retrySpacingMs: number
    agencyOf: ReadonlyMap<string, string>
    imagesLeft: ReadonlyMap<string, number>
    generatingByPost: ReadonlyMap<string, number[]>
  },
  now: Date = new Date()
): { jobs: VisualJob[]; refused: BacklogPost[] } {
  const jobs: VisualJob[] = []
  const refused: BacklogPost[] = []
  const left = new Map(options.imagesLeft)
  let budget = options.maxImagesPerRun
  const retryCutoff = now.getTime() - options.retrySpacingMs

  const ordered = [...posts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  for (const post of ordered) {
    if (!isStillPaintable(post)) continue
    if (post.visuals_attempted_at !== null) {
      if (new Date(post.visuals_attempted_at).getTime() > retryCutoff) continue
    }
    const positions = missingPositions(
      post,
      imagesByPost.get(post.id) ?? [],
      options.generatingByPost.get(post.id) ?? []
    )
    if (positions.length === 0) continue

    const agencyId = options.agencyOf.get(post.client_id)
    const pool = agencyId === undefined ? 0 : (left.get(agencyId) ?? 0)
    if (positions.length > pool) {
      refused.push(post)
      continue
    }
    if (positions.length > budget) continue
    budget -= positions.length
    if (agencyId !== undefined) left.set(agencyId, pool - positions.length)
    jobs.push({ postId: post.id, clientId: post.client_id, positions })
  }
  return { jobs, refused }
}

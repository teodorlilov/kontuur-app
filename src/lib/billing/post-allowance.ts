import { meteredLimit, type Allowance, type AllowanceKind } from './plans'

/**
 * How many posts a period can still pay for — the one number a run is decided by.
 *
 * The ledger counts drafts and images separately because they bound different things: a draft is
 * a post's text, while an image also pays for every re-roll, inpaint and vector element the editor
 * spends on a post that is already written. But a post needs both, and the two pools are not
 * commensurate — a plan budgets about three images per draft while a carousel costs one per slide
 * — so asking them separately is what let a run start with drafts it could never illustrate. Every
 * surface that decides whether to generate asks this instead, and no surface restates the rule.
 *
 * `slidesPerPost` is what one post costs in images: `totalVisualSlots` for a row that exists
 * (lib/visual/visual-backlog.ts), the wizard's chosen format before one does. A read, not a
 * reservation: the atomic compare-and-set in `consume_usage` stays the backstop for a race with
 * the cron or a second tab.
 */
export interface PostsAffordable {
  /** Posts still affordable, or null when the workspace is unmetered. */
  posts: number | null
  /** The pool that runs out first — what a refusal names. Null when unmetered. */
  limiting: AllowanceKind | null
}

export function postsAffordable(
  limits: Allowance,
  committed: Allowance,
  slidesPerPost: number
): PostsAffordable {
  // A post owes at least one picture; a carousel with no slides owes nothing and is not a run.
  const slides = Math.max(1, Math.floor(slidesPerPost))
  const draftLimit = meteredLimit(limits.draft)
  const imageLimit = meteredLimit(limits.image)
  const drafts = draftLimit === null ? null : Math.max(0, draftLimit - committed.draft)
  const images = imageLimit === null ? null : Math.max(0, imageLimit - committed.image)

  if (drafts === null && images === null) return { posts: null, limiting: null }
  const fromDrafts = drafts ?? Infinity
  const fromImages = images === null ? Infinity : Math.floor(images / slides)
  return fromDrafts <= fromImages
    ? { posts: fromDrafts, limiting: 'draft' }
    : { posts: fromImages, limiting: 'image' }
}

/** Whether a single-image post — the cheapest one there is — can still be made at all. */
export function canMakeAPost(limits: Allowance, committed: Allowance): boolean {
  const { posts } = postsAffordable(limits, committed, 1)
  return posts === null || posts > 0
}

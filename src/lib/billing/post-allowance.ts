import {
  NOTHING_OWED,
  OWED_IMAGES_UNKNOWN,
  cannotSpendNotice,
  postsLeft,
  type OwedImages,
} from './copy'
import type { Entitlement } from './entitlement'
import { meteredLimit, type Allowance, type AllowanceKind } from './plans'

/**
 * What is left of one pool this period, or null when it is unmetered — the one subtraction every
 * surface budgets with: the posts a run can afford here, whether the wizard may still paint a
 * picture, and how many pictures the visuals cron may spend per workspace. Never below zero: a
 * counter past its quota (a settle that landed after the period turned) is spent, not negative.
 */
export function poolLeft(
  limits: Allowance,
  committed: Allowance,
  kind: AllowanceKind
): number | null {
  const limit = meteredLimit(limits[kind])
  return limit === null ? null : Math.max(0, limit - committed[kind])
}

/**
 * The committed figures with the pictures earlier posts still owe set aside from the image pool
 * (`owedImagesOf`, src/lib/visual/owed-images.ts), which is what a NEW run is measured against:
 * those pictures are coming out of the same pool, and a run that takes them leaves posts that
 * can never be painted.
 */
export function committedWithOwed(committed: Allowance, owed: OwedImages): Allowance {
  return { ...committed, image: committed.image + owed.images }
}

/**
 * One post's cost in images: `slidesPerPost` floored to a whole number and never below one, since
 * a post owes at least one picture. The one reading `postsAffordable` and `runShortfall` share, so
 * the ceiling and the shortfall never price a post two ways.
 */
function imagesPerPost(slidesPerPost: number): number {
  return Math.max(1, Math.floor(slidesPerPost))
}

/** The posts a period can still pay for, and the pool that runs out first. */
export interface PostsAffordable {
  /** Posts still affordable, or null when the workspace is unmetered. */
  posts: number | null
  /** The pool that runs out first — what a refusal names. Null when unmetered. */
  limiting: AllowanceKind | null
}

/**
 * How many posts a period can still pay for, and the pool that runs out first — the one number a
 * run is decided by. A post needs a draft and a picture per slide, and the two pools are not
 * commensurate (`PRO_PLAN`, plans.ts, budgets 4.2 images per draft while a carousel costs one per
 * slide), so asking them separately is what let a run start with drafts it could never
 * illustrate. Every surface that decides whether to generate asks this; none restates the rule.
 *
 * `slidesPerPost` is one post's cost in images — `totalVisualSlots` for a row that exists
 * (lib/visual/visual-backlog.ts), the wizard's chosen format before one does — as `imagesPerPost`
 * reads it. Both fields are null only when neither pool is metered; with one metered, that pool
 * alone decides, and a tie names the draft pool. A read, not a reservation: the compare-and-set in
 * `consume_usage` stays the backstop for a race with the cron or a second tab.
 */
export function postsAffordable(
  limits: Allowance,
  committed: Allowance,
  slidesPerPost: number
): PostsAffordable {
  const slides = imagesPerPost(slidesPerPost)
  const drafts = poolLeft(limits, committed, 'draft')
  const images = poolLeft(limits, committed, 'image')

  if (drafts === null && images === null) return { posts: null, limiting: null }
  const fromDrafts = drafts ?? Infinity
  const fromImages = images === null ? Infinity : Math.floor(images / slides)
  return fromDrafts <= fromImages
    ? { posts: fromDrafts, limiting: 'draft' }
    : { posts: fromImages, limiting: 'image' }
}

/**
 * A Generate control's answer: why no run may start (null when one may), and whether Plan &
 * billing is the way past it — the shape of `AddBrandGate` (copy.ts).
 */
export interface GenerateGate {
  refusal: string | null
  wayOut: boolean
}

/**
 * Whether a new run may start at all — the one answer for every Generate control (the dashboard's,
 * the wizard's form). A workspace that cannot spend is told why (`cannotSpendNotice`); owed
 * pictures that could not be read (`owed` null) are unknown, not zero, so no run is offered on
 * them while the image pool is metered, and no plan would change that; otherwise the cheapest post there is — one picture — is
 * measured against what is left once the pictures earlier posts still owe are set aside. A dearer
 * format that no longer fits is not a refusal here: the wizard's stepper and panel refuse at the
 * chosen format.
 */
export function generationGate(
  entitlement: Pick<
    Entitlement,
    'canSpend' | 'state' | 'paymentFailed' | 'trialEndsAt' | 'graceEndsAt' | 'timezone' | 'limits'
  >,
  committed: Allowance,
  owed: OwedImages | null
): GenerateGate {
  const notice = cannotSpendNotice(entitlement)
  if (notice) return { refusal: notice.text, wayOut: true }
  const imagesLeft = poolLeft(entitlement.limits, committed, 'image')
  if (owed === null && imagesLeft !== null) return { refusal: OWED_IMAGES_UNKNOWN, wayOut: false }
  const { posts, limiting } = postsAffordable(
    entitlement.limits,
    committedWithOwed(committed, owed ?? NOTHING_OWED),
    1
  )
  if (posts === null || posts > 0) return { refusal: null, wayOut: true }
  const refusal = postsLeft(
    0,
    limiting,
    0,
    imagesLeft === null || owed === null ? undefined : { left: imagesLeft, perPost: 1, owed }
  )
  return { refusal, wayOut: true }
}

/**
 * The most researched posts a run may ask for: what the period can afford at the chosen format,
 * less the priority briefs riding on top — they are posts too. Infinity when unmetered. The
 * stepper's ceiling, the count the wizard clamps to on first load, a client switch and a format
 * change, and the scheduled batch's size all read this.
 */
export function runCeiling(affordable: PostsAffordable, briefCount: number): number {
  return affordable.posts === null ? Infinity : Math.max(0, affordable.posts - briefCount)
}

/**
 * What a run of `posts` at the chosen format is short of — the pool that binds and what the run
 * needs from it, in that pool's units, a post priced by `imagesPerPost` as `postsAffordable`
 * prices it — or null when the period can pay for it (`affordable` measured with the owed
 * pictures set aside). The one "does this run fit" answer: the wizard's panel refuses on it,
 * `generate-stream` answers its 402 from it, and the scheduled batch's exhausted bell names it
 * for one post (`planScheduledBatch`, src/lib/generation/scheduled-budget.ts).
 */
export function runShortfall(
  affordable: PostsAffordable,
  posts: number,
  slidesPerPost: number
): { kind: AllowanceKind; needed: number } | null {
  if (affordable.posts === null || affordable.limiting === null || posts <= affordable.posts) {
    return null
  }
  const needed = affordable.limiting === 'image' ? posts * imagesPerPost(slidesPerPost) : posts
  return { kind: affordable.limiting, needed }
}

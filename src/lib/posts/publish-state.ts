import type { PostStatus } from '@/lib/validation'
import type { PublicationEmbedColumns } from '@/lib/queries/select-columns'

/**
 * The lifecycle of one destination. Narrower than a post's, which is editorial.
 *
 * Lives here rather than beside the store that writes it: six read surfaces speak this
 * vocabulary and one writes it, and pointing all six at the writer would make every
 * calendar card import the publish path.
 */
export type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed'

/**
 * What a post's destinations add up to — computed, never stored.
 *
 * `posts.status` stops at the editorial lifecycle (draft → pending_review → approved →
 * scheduled). Whether something went out, and where, is a question for its publications, so
 * this is the one place that reduces several destinations to the single word a calendar
 * cell can show.
 *
 * It is deliberately NOT a column. A stored rollup drifts the moment a destination changes
 * underneath it, and it would have to answer "published or failed?" for the most likely
 * mixed outcome of all — one network live, another on a dead token — with a single value
 * that is wrong either way.
 */
type PostPublishState = 'unpublished' | 'publishing' | 'published' | 'partly' | 'failed'

export interface PublicationSummary {
  id: string
  platform: string
  status: PublicationStatus
  publishedAt: string | null
  publishError: string | null
}

/**
 * One embedded `post_publications` row as the read surfaces speak it.
 *
 * The table is snake_case and every consumer of this type is camelCase, so the rename happens
 * once, here, rather than inline at each query that embeds `PUBLICATION_EMBED`. It was written
 * out in the calendar page and was about to be written out a second time in the dashboard's
 * caches — two spellings of one translation is how the two come to disagree about what a
 * publication is.
 */
export function toPublicationSummary(row: PublicationEmbedColumns): PublicationSummary {
  return {
    id: row.id,
    platform: row.platform,
    // WHY as: the column is `text` in the generated types; the lifecycle it holds is this union.
    status: row.status as PublicationStatus,
    publishedAt: row.published_at,
    publishError: row.publish_error,
  }
}

/**
 * First match wins, and the order encodes what a person needs to know first.
 *
 * `partly` exists because "some of it went out" is neither success nor failure and is the
 * outcome most worth surfacing: the post is live somewhere, and somewhere else needs
 * attention. Collapsing it into `published` would hide a failure; into `failed` would claim
 * a live post never went out.
 */
export function publishStateOf(publications: readonly PublicationSummary[]): PostPublishState {
  if (publications.length === 0) return 'unpublished'

  const published = publications.filter((p) => p.status === 'published').length
  if (publications.some((p) => p.status === 'publishing')) return 'publishing'
  if (published === publications.length) return 'published'
  if (published > 0) return 'partly'
  if (publications.some((p) => p.status === 'failed')) return 'failed'
  return 'unpublished'
}

/**
 * Is this post still expected to go out?
 *
 * True while nothing has gone out and nothing has permanently failed — 'publishing' counts,
 * because a destination mid-send is still on its way. Both readers of "what is still to come"
 * sit on the same dashboard card (the scheduled-this-week count and the coverage grid), and
 * each had written this two-value test out for itself. `SCHEDULED_STATUSES` carries a docblock
 * promising those two "can never measure different things"; sharing the status list alone did
 * not deliver that, because the publish-state half of the same criterion was duplicated.
 */
export function isAwaitingPublish(publications: readonly PublicationSummary[]): boolean {
  const state = publishStateOf(publications)
  return state === 'unpublished' || state === 'publishing'
}

/** The destinations a person has to act on, and what went wrong on each. */
export function failedPublications(
  publications: readonly PublicationSummary[]
): PublicationSummary[] {
  return publications.filter((p) => p.status === 'failed')
}

/**
 * Why the post failed, in one line, for surfaces that have room for one.
 *
 * A lane of identical "Failed" chips says the week went wrong without saying whether it
 * was one expired token or five posts with no images — the difference between one fix and
 * five. With more than one failed destination this shows the first; the card that can
 * afford the space lists them all.
 */
export function firstFailureReason(publications: readonly PublicationSummary[]): string | null {
  return failedPublications(publications).find((p) => p.publishError)?.publishError ?? null
}

/**
 * What a post looks like on a card: where it is editorially, or what its destinations did.
 *
 * The two lifecycles used to share `posts.status`, so a chip read one column. They are
 * separate tables now, and this is the one place that decides which one a card shows —
 * without it, every surface would write its own precedence and they would disagree.
 *
 * The publish state wins once there is one, because a scheduled post that has actually
 * gone out is published, and saying "Scheduled" over live media is the more wrong of the
 * two answers.
 */
export type PostDisplayState = PostStatus | Exclude<PostPublishState, 'unpublished'>

export function postDisplayState(
  status: PostStatus,
  publications: readonly PublicationSummary[]
): PostDisplayState {
  const state = publishStateOf(publications)
  return state === 'unpublished' ? status : state
}

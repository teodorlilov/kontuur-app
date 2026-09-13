import type { PostRow } from '@/types'
import type { PostSummary } from '@/types/post'
import type { PublicationEmbedColumns } from '@/lib/queries/select-columns'
import { isAwaitingPublish, toPublicationSummary } from '@/lib/posts/publish-state'
import { toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'

/** Whether a given day of a client's week is published, scheduled, or still open. */
export type DayState = 'published' | 'scheduled' | 'open'

/**
 * One day of a client's week: its state, the post that set it, and how many posts touched it.
 *
 * `postId` and `at` name the EARLIEST post of the winning state — published beats scheduled, and
 * the query behind this carries no order, so "earliest" is decided here. `count` is distinct
 * posts across both states: a lane that shows one post must be able to say it is hiding more.
 */
export interface WeekDay {
  state: DayState
  postId: string | null
  at: string | null
  count: number
}

/**
 * A post with what its destinations have done about it — exactly what `UPCOMING_POST_COLUMNS`
 * plus `PUBLICATION_EMBED` returns.
 *
 * Status is filtered in SQL at every site that reads it, so it is not carried — and the editorial
 * status could not answer whether the slot is still live anyway: `posts.status` stays 'scheduled'
 * whatever the destinations do.
 */
export type PostWithPublications = PostSummary & {
  post_publications: PublicationEmbedColumns[]
}

/**
 * A post one of whose destinations went live this week, with the moments it did.
 *
 * `published_at` is not a post column: each destination went live at its own moment, so the grid
 * asks the publications. A post counts as published on a day if ANY destination went out then —
 * which is the honest reading of "did something go out that day".
 */
export type PublishedPostRow = Pick<PostRow, 'id' | 'client_id'> & {
  post_publications: Array<{ published_at: string }>
}

interface WeekCoverageInput {
  published: PublishedPostRow[]
  due: PostWithPublications[]
  /** The seven `YYYY-MM-DD` keys of the week, Monday first. */
  dayKeys: string[]
  timeZone: string
}

/** Seven open days: what a client with nothing on the books this week looks like. */
export function emptyWeek(): WeekDay[] {
  return Array.from({ length: DAYS_PER_WEEK }, () => ({
    state: 'open',
    postId: null,
    at: null,
    count: 0,
  }))
}

/**
 * Buckets a week's posts into seven days per client.
 *
 * Bucketing happens in the zone the query window was built from, or a post near midnight lands in
 * a column the query never covered. `dayKeys.indexOf` returning −1 is checked but should be
 * unreachable: it WAS reachable while `scheduled_at` was `timestamp WITHOUT time zone`, so
 * Postgres compared it with the zone dropped off both bounds while this bucketed the same value in
 * the agency's zone; migration 20260843 gave the column its zone, so the SQL window and this fold
 * describe the same instants.
 *
 * Published is folded first and is claimed by the destination's own moment rather than the post's.
 * A due row only fills a day that is still open, and only while its destinations agree it is
 * still to come (`isAwaitingPublish`): judged from the post's own publications rather than from
 * the week's published set, which can only see publishes that landed INSIDE this week — a post
 * published early, in the week before its slot, used to be drawn as scheduled, and a post whose
 * destinations had permanently failed as a covered day for a publish that was never coming.
 * 'publishing' stays scheduled on purpose: mid-send is still a slot something is about to come
 * out of. A 'publishing' post appears in BOTH query halves, which is why `count` is a set of ids
 * rather than a tally.
 *
 * Pure so it can be tested: the reader that calls it (`cache.ts`) cannot be imported by the node
 * test project.
 */
export function foldWeekCoverage(input: WeekCoverageInput): Record<string, WeekDay[]> {
  const coverage: Record<string, WeekDay[]> = {}
  const seen = new Map<string, Set<string>>()
  const weekOf = (clientId: string) => (coverage[clientId] ??= emptyWeek())
  const dayOf = (stamp: string) => input.dayKeys.indexOf(toDateKey(new Date(stamp), input.timeZone))
  const claim = (
    clientId: string,
    dayIndex: number,
    postId: string,
    at: string,
    state: DayState
  ) => {
    const day = weekOf(clientId)[dayIndex]
    if (!day) return
    const ids = seen.get(`${clientId}:${dayIndex}`) ?? new Set<string>()
    ids.add(postId)
    seen.set(`${clientId}:${dayIndex}`, ids)
    day.count = ids.size
    if (day.state === state && day.at !== null && day.at <= at) return
    if (day.state === 'published' && state === 'scheduled') return
    day.state = state
    day.postId = postId
    day.at = at
  }

  for (const row of input.published) {
    for (const publication of row.post_publications) {
      const dayIndex = dayOf(publication.published_at)
      if (dayIndex !== -1)
        claim(row.client_id, dayIndex, row.id, publication.published_at, 'published')
    }
  }

  for (const row of input.due) {
    if (!row.scheduled_at) continue
    if (!isAwaitingPublish((row.post_publications ?? []).map(toPublicationSummary))) continue
    const dayIndex = dayOf(row.scheduled_at)
    if (dayIndex !== -1) claim(row.client_id, dayIndex, row.id, row.scheduled_at, 'scheduled')
  }

  return coverage
}

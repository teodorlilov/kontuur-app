import { getWeekDayKeys, getWeekRange, isoToDateTimeFields, toDateKey } from '@/utils/date-helpers'
import { WEEKDAY_LABELS } from '@/utils/constants'
import type { CalendarPost } from '@/types/api'
import { publishStateOf, type PublicationSummary } from '@/lib/posts/publish-state'

/**
 * What the grid draws, derived from what the page loaded.
 *
 * Pure so it can be tested: the suite runs `environment: 'node'` with no
 * testing-library, so anything left inside a component is covered by nothing.
 */

/**
 * Group posts by the day they fall on in `timeZone`, each bucket in time order.
 *
 * The key comes from `toDateKey`, not from slicing the raw column: `scheduled_at` is a
 * UTC instant, so its first ten characters are the UTC day. For any agency east or west
 * of UTC that is the wrong cell either side of midnight — a 22:30Z post belongs to
 * tomorrow in Sofia and to today in London.
 *
 * Sorting here rather than at the call site because the page orders by `created_at DESC`,
 * so a day's posts arrive newest-first: without this a 09:00 post renders below an 18:00
 * one, and the lane stops reading as a timeline.
 */
export function groupPostsByDate(
  posts: CalendarPost[],
  timeZone?: string
): Map<string, CalendarPost[]> {
  const map = new Map<string, CalendarPost[]>()
  for (const post of posts) {
    if (!post.scheduled_at) continue
    const key = toDateKey(new Date(post.scheduled_at), timeZone)
    const list = map.get(key) ?? []
    list.push(post)
    map.set(key, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  }
  return map
}

/**
 * The posts that fall inside a week, compared as **instants**.
 *
 * Two callers filtered this by comparing the raw `scheduled_at` string against
 * `getWeekRange`'s output with `>=` and `<`. Those are two different renderings of the
 * same instant — PostgREST returns `2026-08-10T21:00:00+00:00`, `toISOString()` produces
 * `2026-08-10T21:00:00.000Z` — and lexicographically `'+'` (0x2B) sorts before `'.'`
 * (0x2E), so a post sitting exactly on the week's first instant compared as *before* it.
 * A post scheduled for midnight on the Monday dropped out of the week's own count and out
 * of the client list the approval buttons offer.
 *
 * `Date.parse` on both sides removes the question: an instant is an instant however it
 * was spelled.
 */
export function postsInWeek(
  posts: CalendarPost[],
  weekStartISO: string,
  timeZone: string
): CalendarPost[] {
  const { from, to } = getWeekRange(weekStartISO, timeZone)
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  return posts.filter((post) => {
    if (!post.scheduled_at) return false
    const at = Date.parse(post.scheduled_at)
    return at >= fromMs && at < toMs
  })
}

// ---- Coverage ----

/**
 * What one day of a client's week says.
 *
 * Ordered weakest → strongest claim, which is also the precedence order below.
 *
 * Every state is a fact about posts that exist. `open` and `missed` used to sit between
 * `none` and `scheduled`, describing a suggested slot nothing filled; they went with the
 * suggestions (migration 20260848). A day with no post is `none`, and whether that is a
 * problem is the cadence verdict's question, not a colour's.
 */
export type CoverageState = 'none' | 'scheduled' | 'published' | 'failed'

const STATE_RANK: Record<CoverageState, number> = {
  none: 0,
  scheduled: 1,
  published: 2,
  /**
   * Failed outranks everything, including published. A day holding one published post
   * and one failure is a day that needs a human — surfacing the success would hide the
   * only thing on it that is asking for something.
   */
  failed: 3,
}

/**
 * How a post reads as a day state.
 *
 * Driven by its destinations, not its status: the status stops at 'scheduled' now, and
 * whether the day went well is what its publications did. 'partly' counts as published —
 * something went out that day, which is what the grid is claiming.
 */
function stateOfPost(publications: readonly PublicationSummary[]): CoverageState {
  const state = publishStateOf(publications)
  if (state === 'failed') return 'failed'
  if (state === 'published' || state === 'partly') return 'published'
  return 'scheduled'
}

/**
 * The stronger claim of two day states.
 *
 * Private, and used by both reducers below. A second `>` against a second copy of the
 * rank table is how the week and the month would come to disagree about a day holding
 * both a published post and a failure.
 */
function strongerOf(a: CoverageState, b: CoverageState): CoverageState {
  return STATE_RANK[b] > STATE_RANK[a] ? b : a
}

/**
 * How a day of posts reads as one state.
 *
 * The month says what is *placed*. Whether a client is short of their cadence is a
 * different question with a target behind it, and the Clients tab asks it.
 */
export function strongestState(posts: CalendarPost[]): CoverageState {
  return posts.reduce<CoverageState>(
    (strongest, post) => strongerOf(strongest, stateOfPost(post.publications)),
    'none'
  )
}

/**
 * One day of a client's week.
 *
 * The **time** rides along with the state, because a coverage cell that shows only a
 * tone answers "is this day covered" and not "at what hour" — and the hour is the fact
 * the agency is actually scheduling. It is when the day's strongest post goes out.
 */
export interface ClientDay {
  state: CoverageState
  /** The instant this day's strongest item sits at, or null when the day is empty. */
  at: string | null
}

export interface ClientWeek {
  /** Seven days, Monday first. */
  week: ClientDay[]
  /** Posts placed this week, however they turned out. */
  filled: number
  /** The agency's weekly target. 0 when no cadence has been set. */
  target: number
  verdict: 'On track' | 'Dark this week' | 'No cadence set' | `${number} short`
}

/**
 * One client's week: a state per day, plus the ratio and verdict the header reads.
 *
 * A **transpose** of the day buckets, not a second pass over the posts. Bucketing twice
 * would be two chances to disagree about which day a 23:30 post belongs to, which is the
 * bug the zoned key exists to kill.
 *
 * `filled` counts posts rather than days, because the target is posts per week: two posts
 * on one Tuesday is two towards a target of three, not one.
 */
export function buildClientWeek(input: {
  clientId: string
  /** The same lanes the week grid draws, so both views agree about every day. */
  lanes: Map<string, LaneItem[]>
  weekStartISO: string
  target: number
}): ClientWeek {
  const { clientId, lanes, weekStartISO, target } = input

  let filled = 0
  const week = getWeekDayKeys(weekStartISO).map((dayKey) => {
    const mine = (lanes.get(dayKey) ?? []).filter((item) => item.post.client_id === clientId)
    filled += mine.length

    // The strongest item, and the time *it* sits at — not the first item's. A day holding
    // a 09:00 that published and an 18:00 still scheduled reads as published, so it must
    // show 09:00; the first item's time would label the day with the wrong post's hour.
    return mine.reduce<ClientDay>(
      (strongest, item) => {
        const next = stateOfPost(item.post.publications)
        // `strongerOf` returns the first argument on a tie, so an equal state keeps the
        // earlier item's time — which is the one the lane already sorted to the top.
        return strongerOf(strongest.state, next) === strongest.state
          ? strongest
          : { state: next, at: item.at }
      },
      { state: 'none', at: null }
    )
  })

  return { week, filled, target, verdict: verdictFor(filled, target) }
}

/**
 * How many clients are short of their own weekly target.
 *
 * Counts posts directly rather than going through `buildWeekLanes` + `buildClientWeek`,
 * which would build seven lanes to reach a number derived from post counts alone. The
 * rail badge renders in all three modes, so it would be paying for a week's lanes even
 * on the month.
 *
 * A client with no cadence set has no target to be behind and is never counted.
 */
export function countClientsBehind(
  posts: CalendarPost[],
  clients: ReadonlyArray<{ id: string; posts_per_week: number }>,
  weekStartISO: string,
  timeZone: string
): number {
  const thisWeek = postsInWeek(posts, weekStartISO, timeZone)
  const filledByClient = new Map<string, number>()
  for (const post of thisWeek) {
    filledByClient.set(post.client_id, (filledByClient.get(post.client_id) ?? 0) + 1)
  }
  return clients.filter(
    (client) =>
      client.posts_per_week > 0 && (filledByClient.get(client.id) ?? 0) < client.posts_per_week
  ).length
}

function verdictFor(filled: number, target: number): ClientWeek['verdict'] {
  // No target means nobody has said what this client's week should look like, so there
  // is no deficit to report — an absent cadence is not a failing one.
  if (target <= 0) return 'No cadence set'
  if (filled === 0) return 'Dark this week'
  if (filled < target) return `${target - filled} short`
  return 'On track'
}

const STATE_WORDS: Record<CoverageState, string> = {
  none: 'nothing',
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed to publish',
}

const DAY_WORDS = WEEKDAY_LABELS

/**
 * The same week in words.
 *
 * DESIGN.md calls a coverage strip without its spoken equivalent "incomplete, not merely
 * imperfect" — the chips carry real data in a purely visual form, so this is part of the
 * component rather than an accessibility afterthought. Exported as a pure function
 * because that is the only part of it the node-environment suite can reach.
 */
export function describeCoverage(week: ClientDay[], timeZone: string): string {
  const said = week
    .map((day, index) => {
      if (day.state === 'none') return null
      // The hour is spoken too, because it is now printed in the cell. A sighted reader
      // sees "Wednesday 09:00, scheduled"; anything less here is a lesser version of the
      // same strip rather than an equivalent one.
      const at = day.at ? ` ${isoToDateTimeFields(day.at, timeZone).time}` : ''
      return `${DAY_WORDS[index]}${at} ${STATE_WORDS[day.state]}`
    })
    .filter(Boolean)
  return said.length === 0 ? 'Nothing this week.' : `${said.join(', ')}.`
}

// ---- Lanes ----

/**
 * One thing in a day's lane.
 *
 * Still a tagged shape rather than a bare `CalendarPost`, because the lane sorts on `at`
 * and every consumer switches on `kind`. It was a union — a post or a suggested slot —
 * until the suggestions were removed (migration 20260848); a post is now the only thing
 * a lane holds.
 */
export type LaneItem = { kind: 'post'; at: string; post: CalendarPost }

/**
 * Every post of the week, bucketed by zoned day key and ordered by time.
 *
 * Kept as a builder rather than folded into `groupPostsByDate` because the grid needs
 * every day of the week present — including the empty ones, which a group-by cannot
 * produce — and because the day columns and the Clients tab read the same map, so a day
 * cannot appear scheduled in one view and empty in the other.
 */
export function buildWeekLanes(input: {
  posts: CalendarPost[]
  weekStartISO: string
  timeZone: string
}): Map<string, LaneItem[]> {
  const { posts, weekStartISO, timeZone } = input
  const postsByDate = groupPostsByDate(posts, timeZone)
  const lanes = new Map<string, LaneItem[]>()

  for (const dayKey of getWeekDayKeys(weekStartISO)) {
    lanes.set(
      dayKey,
      (postsByDate.get(dayKey) ?? []).map((post) => ({
        kind: 'post' as const,
        at: post.scheduled_at!,
        post,
      }))
    )
  }

  for (const items of lanes.values()) {
    items.sort((a, b) => a.at.localeCompare(b.at))
  }
  return lanes
}

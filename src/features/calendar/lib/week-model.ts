import {
  getWeekDayKeys,
  getWeekRange,
  isoToDateTimeFields,
  toDateKey,
} from '@/utils/date-helpers'
import { WEEKDAY_LABELS } from '@/utils/constants'
import type { CalendarPost } from '@/types/api'
import type { PostStatus } from '@/lib/validation'
import type { BestTimePlatform } from '@/types/api'
import { suggestWeekSlots } from '@/lib/scheduling/slot-picker'

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
 * `open` and `missed` describe a slot the client's cadence implies and nothing fills —
 * they are unreachable until slots are derived, and are declared now so the strip that
 * renders them is not rebuilt when they arrive. They are day states, not post states:
 * no post is ever "open".
 */
export type CoverageState = 'none' | 'open' | 'missed' | 'scheduled' | 'published' | 'failed'

const STATE_RANK: Record<CoverageState, number> = {
  none: 0,
  open: 1,
  missed: 2,
  scheduled: 3,
  published: 4,
  /**
   * Failed outranks everything, including published. A day holding one published post
   * and one failure is a day that needs a human — surfacing the success would hide the
   * only thing on it that is asking for something.
   */
  failed: 5,
}

/** How a post's status reads as a day state. */
function stateOfPost(status: PostStatus): CoverageState {
  if (status === 'failed') return 'failed'
  if (status === 'published') return 'published'
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
 * Posts only — no slots. The month says what is *placed*; deriving open and missed
 * slots for six weeks across every client would be the deficit question, and that is
 * the Clients tab's job with a target to measure against.
 */
export function strongestState(posts: CalendarPost[]): CoverageState {
  return posts.reduce<CoverageState>(
    (strongest, post) => strongerOf(strongest, stateOfPost(post.status as PostStatus)),
    'none'
  )
}

/**
 * One day of a client's week.
 *
 * The **time** rides along with the state, because a coverage cell that shows only a
 * tone answers "is this day covered" and not "at what hour" — and the hour is the fact
 * the agency is actually scheduling. For a placed post it is when it goes out; for an
 * open or missed slot it is the suggested time nothing filled, which the hatch already
 * marks as a suggestion rather than a commitment.
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
    const mine = (lanes.get(dayKey) ?? []).filter((item) =>
      item.kind === 'post' ? item.post.client_id === clientId : item.clientId === clientId
    )
    filled += mine.filter((item) => item.kind === 'post').length

    // The strongest item, and the time *it* sits at — not the first item's. A day
    // holding a filled 09:00 and an unfilled 18:00 reads as scheduled, so it must show
    // 09:00; showing the open slot's hour would label a covered day with a gap's time.
    return mine.reduce<ClientDay>(
      (strongest, item) => {
        const next: CoverageState =
          item.kind === 'post'
            ? stateOfPost(item.post.status as PostStatus)
            : item.missed
              ? 'missed'
              : 'open'
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
 * Counts posts directly rather than going through `buildWeekLanes` + `buildClientWeek`.
 * That is not just cheaper, it is what the question actually needs: suggested slots move
 * a day's *state*, never `filled` or the verdict, so building seven lanes and every
 * client's slot set to reach a number derived from post counts alone was work whose
 * result was discarded. The rail badge renders in all three modes, so it was paying for a
 * week's lanes even on the month.
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
  open: 'an open slot',
  missed: 'a slot that passed unfilled',
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
 * One thing in a day's lane: a post, or a slot nothing fills.
 *
 * A slot in the past is `missed` — a record that the cadence went unmet, not a task
 * anyone can still do. That distinction is why it is a separate state and not just an
 * open slot with an earlier timestamp.
 */
export type LaneItem =
  | { kind: 'post'; at: string; post: CalendarPost }
  | { kind: 'slot'; at: string; clientId: string; clientName: string; missed: boolean }

export interface LaneClient {
  id: string
  name: string
  platform: string | null
  bestTimes: BestTimePlatform[] | null
}

/**
 * Everything the week grid draws, bucketed by zoned day key and ordered by time.
 *
 * Slots are **suggestions**, not evidence — see `slot-picker.ts`. A client with nothing
 * stored contributes no slots at all rather than a guessed cadence.
 *
 * A suggested time is dropped when that client already has a post that day: the slot
 * exists to show a gap, and a day they are already posting on is not one. Matching on
 * the day rather than the exact time is deliberate — a post moved from 09:00 to 11:00
 * still fills that day's slot, and pairing on the timestamp would draw a ghost beside it.
 */
export function buildWeekLanes(input: {
  posts: CalendarPost[]
  clients: LaneClient[]
  weekStartISO: string
  timeZone: string
  now: Date
}): Map<string, LaneItem[]> {
  const { posts, clients, weekStartISO, timeZone, now } = input
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

  for (const client of clients) {
    const daysTheyPost = new Set(
      posts
        .filter((p) => p.client_id === client.id && p.scheduled_at)
        .map((p) => toDateKey(new Date(p.scheduled_at!), timeZone))
    )

    for (const at of suggestWeekSlots({
      platform: client.platform,
      bestTimes: client.bestTimes,
      weekStartISO,
      timeZone,
    })) {
      const dayKey = toDateKey(new Date(at), timeZone)
      if (daysTheyPost.has(dayKey)) continue
      lanes.get(dayKey)?.push({
        kind: 'slot',
        at,
        clientId: client.id,
        clientName: client.name,
        missed: new Date(at) < now,
      })
    }
  }

  for (const items of lanes.values()) {
    items.sort((a, b) => a.at.localeCompare(b.at))
  }
  return lanes
}

import { DAYS_PER_WEEK } from '@/utils/constants'
import {
  formatScheduledAt,
  getMondayISO,
  getWeekDayKeys,
  getZonedParts,
  shiftDateKey,
  toDateKey,
} from '@/utils/date-helpers'
import type { BestTimePlatform } from '@/lib/suggested-times/schemas'

/**
 * When a client *might* post.
 *
 * The source is `brand_profiles.best_time_json`, and it is MEASURED — the only thing that writes it
 * is `deriveObservedBestTime`, reading Instagram's hourly follower-online counts off the last 28
 * days and averaging them into a weekday x hour grid.
 *
 * There used to be a second writer: a Haiku call that imagined posting times from four profile
 * fields for clients with no connected account. It was deleted, not narrowed. Both writers produced
 * the same shape into the same column and `suggestWeekSlots` returns bare timestamps, so nothing
 * downstream could tell a measurement from an invention — which made every suggestion as
 * trustworthy as the least trustworthy way it could have been produced. An empty calendar that says
 * why is honest; a full one built from a guess is not.
 *
 * So an absent value now means exactly one thing: no measurement yet, because no account is
 * connected or too few days have been collected. Surfaces say that rather than drawing nothing.
 *
 * `suggest*` rather than `best*` in the names below stays. These are hours the audience was
 * observed to be ONLINE, which is evidence about attention, not about outcomes — the reach a
 * publish window actually earned is a different measurement (`buildPublishWindows`).
 *
 * The count a client is measured against (`posts_per_week`) is a different matter: an
 * agency set it by hand, and it is the honest half of every deficit claim.
 *
 * The folder is `suggested-times` and was `scheduling`, which contained no scheduling: nothing here
 * reads `scheduled_at` or knows the publish queue exists. What acts on a schedule is
 * `publishDuePosts` in features/publishing/lib/scheduler.ts. The suggest/best distinction this
 * module argues for in its own names was the one thing its directory did not apply.
 */

export interface SlotPickerInput {
  bestTimes: BestTimePlatform[] | null
  /** The client's weekly target; 0 = no cap. */
  postsPerWeek: number
  /** ISO timestamps this client already holds (this week and next). */
  occupiedSlots: string[]
  now: Date
  /**
   * The agency zone. Slot times are wall-clock in it, not in the runtime's.
   *
   * Required. Optional it silently produced browser-local instants for any caller that
   * forgot, which is the whole class of bug the zoned write path exists to close.
   */
  timeZone: string
}

/**
 * Which platform's suggestions to draw for a client, from what is actually stored.
 *
 * The calendar hardcoded `'Instagram'` for every client, under a comment claiming it read
 * the client's default platform. It does not: no `platform` column exists on `clients` or
 * `brand_profiles`, so there was nothing to read. The effect was that a client whose
 * `best_time_json` holds only Facebook matched no entry, drew no slots, and read as
 * permanently uncovered on both the week grid and the Clients tab.
 *
 * Instagram still wins when the client has an Instagram entry — that is the platform the
 * product publishes to, so it stays the one whose gaps are actionable. Otherwise this
 * falls back to what the client does have rather than to a platform they do not use.
 * Null when nothing is stored, which degrades to no slots at all: the plan's rule is that
 * absent data becomes absence, never a guess.
 *
 * Callers used to pass the answer in beside the times it is derived from. Three of them
 * did, and one of the three read it off the post being scheduled — which stopped being a
 * fact about a post the moment a post could go to two networks. Two arguments where one
 * determines the other is one too many, so the resolution happens here.
 */
export function suggestionPlatform(bestTimes: BestTimePlatform[] | null): string | null {
  if (!bestTimes || bestTimes.length === 0) return null
  const instagram = bestTimes.find((b) => b.platform.toLowerCase() === 'instagram')
  return (instagram ?? bestTimes[0]!).platform
}

/**
 * The suggestion platform's entry, or null when nothing usable is stored for it.
 *
 * Exported for the schedule dialog, which asks the same question — resolve the platform, find
 * its entry, require a first day and a first window — and had written all four steps out again,
 * matching the platform by exact string where this compares case-insensitively.
 */
export function entryFor(bestTimes: BestTimePlatform[] | null): BestTimePlatform | null {
  const platform = suggestionPlatform(bestTimes)
  if (!platform || !bestTimes) return null
  const entry = bestTimes.find((b) => b.platform.toLowerCase() === platform.toLowerCase())
  if (!entry || entry.best_days.length === 0 || entry.best_time_windows.length === 0) return null
  return entry
}

/**
 * Every time the platform's stored pattern implies in the week starting `weekStartISO`,
 * as ISO instants, ascending.
 *
 * Empty when there is no usable entry — the calendar degrades to drawing nothing rather
 * than to guessing about a guess.
 */
export function suggestWeekSlots(input: {
  bestTimes: BestTimePlatform[] | null
  weekStartISO: string
  /** The agency zone — see the note on `SlotPickerInput`. */
  timeZone: string
}): string[] {
  const entry = entryFor(input.bestTimes)
  if (!entry) return []

  const wanted = new Set(entry.best_days.map((day) => day.toLowerCase()))
  const slots: string[] = []

  for (const dayKey of getWeekDayKeys(input.weekStartISO)) {
    // The weekday of a bare calendar date, read in UTC: the key is a date, not an
    // instant, so involving the agency zone here would shift it by the offset.
    const { weekday } = getZonedParts(new Date(`${dayKey}T12:00:00Z`), 'UTC')
    if (!wanted.has(weekday)) continue
    for (const window of entry.best_time_windows) {
      slots.push(formatScheduledAt(dayKey, window.time, input.timeZone))
    }
  }

  return slots.sort()
}

/**
 * The first suggested slot this client can actually take: drops slots in the past, days
 * they already post, and weeks that have hit the posts-per-week target.
 *
 * Spans **three** weeks, not two. The candidate set has to hold at least two future
 * occurrences of every best day after the past filter — on a Friday, for a client whose
 * best day is Monday, the current week's Monday is already gone, so two weeks would
 * leave one candidate and return null the moment it was occupied.
 */
export function pickNextOpenSlot(input: SlotPickerInput): string | null {
  const { postsPerWeek, occupiedSlots, now, timeZone } = input
  if (!entryFor(input.bestTimes)) return null

  const occupiedDays = new Set(occupiedSlots.map((iso) => toDateKey(new Date(iso), timeZone)))
  const countByWeek = new Map<string, number>()
  for (const iso of occupiedSlots) {
    const week = getMondayISO(new Date(iso), timeZone)
    countByWeek.set(week, (countByWeek.get(week) ?? 0) + 1)
  }
  const underWeeklyCap = (iso: string) =>
    postsPerWeek <= 0 ||
    (countByWeek.get(getMondayISO(new Date(iso), timeZone)) ?? 0) < postsPerWeek

  const thisWeek = getMondayISO(now, timeZone)
  const candidates = [0, 1, 2].flatMap((weekOffset) =>
    suggestWeekSlots({
      bestTimes: input.bestTimes,
      weekStartISO: shiftDateKey(thisWeek, weekOffset * DAYS_PER_WEEK),
      timeZone,
    })
  )

  const open = candidates
    .filter((iso) => new Date(iso) > now)
    .filter((iso) => !occupiedDays.has(toDateKey(new Date(iso), timeZone)))
    .filter(underWeeklyCap)
    .sort()
  return open[0] ?? null
}

import { DAYS_PER_WEEK } from '@/utils/constants'
import {
  formatScheduledAt,
  getMondayISO,
  toDateKey,
  weekdayNameToIndex,
} from '@/utils/date-helpers'
import type { BestTimePlatform } from '@/types/api'

export interface SlotPickerInput {
  platform: string | null
  bestTimes: BestTimePlatform[] | null
  /** The client's weekly target; 0 = no cap. */
  postsPerWeek: number
  /** ISO timestamps this client already holds (this week and next). */
  occupiedSlots: string[]
  now: Date
}

/**
 * Unlike date-helpers' getNextDateForDay, today counts as a candidate (the
 * time filter drops slots already past) and "now" is injected for testability.
 */
function upcomingDateKeysForDay(dayName: string, from: Date): string[] {
  const targetIdx = weekdayNameToIndex(dayName)
  if (targetIdx === -1) return []
  const diff = (targetIdx - from.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK
  return [diff, diff + DAYS_PER_WEEK].map((offset) => {
    const date = new Date(from)
    date.setDate(from.getDate() + offset)
    return toDateKey(date)
  })
}

/**
 * The first best-time slot this client can actually take: expands the
 * platform's best days × windows across this week and next, then drops slots
 * in the past, days the client already posts, and weeks that hit the
 * posts-per-week target. Null = no best-time data (the dialog falls back to
 * its other options).
 */
export function pickNextOpenSlot(input: SlotPickerInput): string | null {
  const { platform, bestTimes, postsPerWeek, occupiedSlots, now } = input
  if (!platform || !bestTimes) return null
  const entry = bestTimes.find((b) => b.platform.toLowerCase() === platform.toLowerCase())
  if (!entry || entry.best_days.length === 0 || entry.best_time_windows.length === 0) return null

  const occupiedDays = new Set(occupiedSlots.map((iso) => toDateKey(new Date(iso))))
  const countByWeek = new Map<string, number>()
  for (const iso of occupiedSlots) {
    const week = getMondayISO(new Date(iso))
    countByWeek.set(week, (countByWeek.get(week) ?? 0) + 1)
  }
  const underWeeklyCap = (iso: string) =>
    postsPerWeek <= 0 || (countByWeek.get(getMondayISO(new Date(iso))) ?? 0) < postsPerWeek

  const candidates: string[] = []
  for (const day of entry.best_days) {
    for (const dateKey of upcomingDateKeysForDay(day, now)) {
      for (const window of entry.best_time_windows) {
        candidates.push(formatScheduledAt(dateKey, window.time))
      }
    }
  }

  const open = candidates
    .filter((iso) => new Date(iso) > now)
    .filter((iso) => !occupiedDays.has(toDateKey(new Date(iso))))
    .filter(underWeeklyCap)
    .sort()
  return open[0] ?? null
}

/** An ISO slot as the date/time input pair the scheduling forms edit. */
export function isoToDateTimeFields(iso: string): { date: string; time: string } {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: toDateKey(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }
}

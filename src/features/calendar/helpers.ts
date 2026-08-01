import { toDateKey } from '@/utils/date-helpers'
import type { CalendarPost } from '@/types/api'

/**
 * Returns an array of Date objects for rendering a full month grid.
 * Includes padding days from the previous/next month to fill complete weeks.
 * Week starts on Monday.
 */
export function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6
  const startDow = (firstDay.getDay() + 6) % 7
  const endDow = (lastDay.getDay() + 6) % 7

  const days: Date[] = []

  // Padding from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }

  // Padding to fill last week (up to Sunday)
  const remaining = 6 - endDow
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i))
  }

  return days
}

/** Group posts by their scheduled_at date (YYYY-MM-DD key). */
export function groupPostsByDate(posts: CalendarPost[]): Map<string, CalendarPost[]> {
  const map = new Map<string, CalendarPost[]>()
  for (const post of posts) {
    if (!post.scheduled_at) continue
    const key = post.scheduled_at.slice(0, 10) // 'YYYY-MM-DD'
    const list = map.get(key) ?? []
    list.push(post)
    map.set(key, list)
  }
  return map
}

/** Returns today's date as a 'YYYY-MM-DD' key, in the agency's zone when one is given. */
export function getTodayKey(timeZone?: string): string {
  return toDateKey(new Date(), timeZone)
}

/** The month a calendar is showing. Year and month move together, so they are one value. */
export interface MonthView {
  year: number
  month: number
}

/**
 * Which month "today" falls in, for the given zone.
 *
 * Resolved through `toDateKey` rather than `getMonth()`: either side of midnight the browser's
 * month and the agency's differ, which opens the wrong grid on the first or last of a month — and
 * differs between the server render and the client one.
 */
export function monthViewIn(timeZone: string): MonthView {
  const [year, month] = toDateKey(new Date(), timeZone).split('-').map(Number)
  return { year: year!, month: month! - 1 }
}

/**
 * Steps a month view backwards or forwards, carrying the year.
 *
 * Pure, and one value rather than two pieces of state, because React double-invokes updaters under
 * StrictMode: an earlier version called `setYear` from inside the `setMonth` updater, so crossing
 * January fired twice and skipped a whole year.
 */
export function prevMonthView({ year, month }: MonthView): MonthView {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

export function nextMonthView({ year, month }: MonthView): MonthView {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

export function isSameMonth(date: Date, month: number, year: number): boolean {
  return date.getMonth() === month && date.getFullYear() === year
}

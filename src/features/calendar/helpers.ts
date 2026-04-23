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

/** Format a Date as 'YYYY-MM-DD' */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

/** Returns today's date as a 'YYYY-MM-DD' key. */
export function getTodayKey(): string {
  return toDateKey(new Date())
}

export function isSameMonth(date: Date, month: number, year: number): boolean {
  return date.getMonth() === month && date.getFullYear() === year
}

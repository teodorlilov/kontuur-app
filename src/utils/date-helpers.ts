/** Returns today's weekday as lowercase string: 'monday', 'tuesday', etc.
 *  Accepts an optional IANA timezone (e.g. 'America/New_York'). Defaults to UTC. */
export function getTodayWeekday(timezone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone })
    .format(new Date())
    .toLowerCase()
}

/** Returns the ISO date string (YYYY-MM-DD) of the Monday of the current week. */
export function getMondayISO(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]!
}

/** Combine a date string (YYYY-MM-DD) and time string (HH:MM) into an ISO timestamp. */
export function formatScheduledAt(date: string, time: string): string {
  return new Date(`${date}T${time || '12:00'}:00`).toISOString()
}

/** Map a day name (e.g. 'Monday') to the next occurrence as YYYY-MM-DD. */
export function getNextDateForDay(dayName: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(dayName.toLowerCase())
  if (targetIdx === -1) return ''
  const today = new Date()
  const todayIdx = today.getDay()
  const diff = (targetIdx - todayIdx + 7) % 7 || 7
  const target = new Date(today)
  target.setDate(today.getDate() + diff)
  const y = target.getFullYear()
  const m = String(target.getMonth() + 1).padStart(2, '0')
  const d = String(target.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

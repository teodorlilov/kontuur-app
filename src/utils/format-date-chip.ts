/**
 * Formats today's date as "Mon, 21 April 2026".
 *
 * Pass the agency timezone when rendering inside a client component: with no
 * explicit zone the server formats in its own timezone and the browser in the
 * viewer's, so the two renders disagree and hydration fails.
 */
export function formatDateChip(timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).formatToParts(new Date())

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('weekday')}, ${value('day')} ${value('month')} ${value('year')}`
}

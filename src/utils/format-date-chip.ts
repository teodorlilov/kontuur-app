/** Formats today's date as "Mon, 21 April 2026". */
export function formatDateChip(): string {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'short' })
  const date = now.getDate()
  const month = now.toLocaleDateString('en-GB', { month: 'long' })
  const year = now.getFullYear()
  return `${day}, ${date} ${month} ${year}`
}

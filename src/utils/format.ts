/** Parse a Supabase timestamp string as UTC (appends Z if no timezone info). */
export function parseTimestamp(ts: string): Date {
  if (/[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts)) return new Date(ts)
  return new Date(ts + 'Z')
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Spelled-out date for one-off facts a page states rather than lists — "3 February 2026". */
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Uppercases the first letter, for stored lowercase enums shown as labels (roles, plans). */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '…'
}

/**
 * A caption reduced to a preview line.
 *
 * Generation leaves markdown scaffold at the head of the text — "# POST 1 …" —
 * so a reviewer approving from a preview would otherwise judge the post by its
 * scaffolding rather than its opening sentence. Strips only the leading heading
 * marker and generator label: a caption's own content is never rewritten, and
 * "#hashtag" survives because a markdown heading requires trailing whitespace.
 */
export function toPreviewLine(caption: string): string {
  const cleaned = caption
    .replace(/^﻿/, '')
    .replace(/^\s*#{1,6}[ \t]+/, '')
    .replace(/^\s*POST\s*\d+\s*[:.–—-]?[ \t]*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Never trade real content for a blank line.
  return cleaned || caption.trim()
}

/**
 * Formats a date as "Mon, Apr 28" — short weekday + month + day.
 *
 * Pass `timeZone` from anything rendered on both sides of hydration: without it the server formats
 * in its own zone and the browser re-formats in the visitor's, so the text mismatches and the date
 * can be a day out.
 */
export function formatScheduleDate(date: Date, timeZone?: string): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  })
}

/** Formats a date as "28 Apr" — day + short month, for compact secondary labels. */
export function formatDayMonth(date: Date, timeZone?: string): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone })
}

/** Extracts up to 2-letter initials from a name string, supporting non-Latin scripts. */
export function extractInitials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\s]/gu, '').trim()
  if (!cleaned) return name.charAt(0).toUpperCase() || 'A'
  const parts = cleaned.split(/\s+/)
  const first = parts[0] ?? ''
  const second = parts[1] ?? ''
  if (!second) return first.slice(0, 2).toUpperCase()
  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

/** Formats a number compactly: 1200 → "1.2K", 50 → "50". */
export function formatCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

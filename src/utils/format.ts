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

/**
 * A client's display name, or the one fallback for a row whose join came back
 * empty. Four call sites each spelled `?? 'Client'` before; one word, one place.
 */
export function formatClientName(name: string | null | undefined): string {
  return name ?? 'Client'
}

/** `relativeTo` pins the comparison instant — SSR'd surfaces pass a server-provided
 *  time so the text cannot differ between server render and hydration. */
export function formatRelativeTime(date: Date, relativeTo: Date = new Date()): string {
  const diffMs = relativeTo.getTime() - date.getTime()
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

/**
 * Text reduced to what two values have to share to count as the same one: case and run-length of
 * whitespace are not a difference. The key behind the idea-submission dedup and the brand re-read's
 * "this field already agrees" check, which each spelled the same four calls inline.
 *
 * For comparison only — never store or display the result.
 */
export function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
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

/**
 * A count and its noun: `pluralise(1, 'post')` → "1 post", `pluralise(3, 'post')` → "3 posts".
 *
 * Written inline roughly twenty times before this existed, in three spellings of the same
 * ternary — `=== 1 ? '' : 's'`, `!== 1 ? 's' : ''`, and a local copy of this exact function
 * in the clients roster.
 *
 * `plural` is for the nouns the `+s` rule gets wrong. It was optional-and-unused until the
 * comments header shipped "2 replys owed" to production: every noun the app counted happened
 * to be regular, so the rule looked like a law. Pass it for anything ending in a consonant
 * plus -y, and for the -s/-x/-ch family.
 */
export function pluralise(count: number, noun: string, plural?: string): string {
  if (count === 1) return `${count} ${noun}`
  return `${count} ${plural ?? `${noun}s`}`
}

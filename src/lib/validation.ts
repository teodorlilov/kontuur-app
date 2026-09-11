/**
 * Every status `posts.status` can hold, in lifecycle order. The column is plain text, so this
 * is its only enumeration. Editorial only: publishing state lives per destination on
 * `post_publications.status`. Not `post_approval_tokens.status`, a different column.
 */
export const POST_STATUSES = ['draft', 'pending_review', 'approved', 'scheduled'] as const

export type PostStatus = (typeof POST_STATUSES)[number]

/** Discard-reason values — must mirror the discarded_drafts.reason check constraint (migration 20260805). */
export const DISCARD_REASONS = [
  'off_brand',
  'repetitive',
  'wrong_facts',
  'weak_source',
  'bad_timing',
] as const

export type DiscardReason = (typeof DISCARD_REASONS)[number]

/**
 * Every post status is user-settable now that the publishing lifecycle has left this
 * column, so this is simply "is this a post status".
 *
 * Kept under its old name and callers: renaming it would be a rename for its own sake, and
 * the question it answers at each call site — may this value be written to posts.status —
 * has not changed, only its answer has widened.
 */
export function isUserSettablePostStatus(value: string): boolean {
  return (POST_STATUSES as readonly string[]).includes(value)
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required'
  if (password.length < 10) return 'Password must be at least 10 characters'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return 'Password must contain both letters and numbers'
  return null
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email'
  return null
}

/**
 * `#rrggbb` — the only colour form this app stores or accepts over the wire.
 *
 * One definition because it was written out five times: two canvas doc schemas, the legacy scrim
 * reader, the editor's swatch input and the visual identity schema. Five copies of a pattern is five
 * chances for one of them to quietly start accepting `#abc` or rejecting uppercase, on a value that
 * crosses between a jsonb column, a zod boundary and a Konva fill.
 */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * Every status posts.status can hold, in lifecycle order.
 *
 * The column is a plain text field, so this list is the only enumeration of it —
 * queries that filter on a subset annotate against `PostStatus`, which turns a
 * mistyped status from a silently-empty result into a build failure.
 *
 * Not to be confused with post_approval_tokens.status ('pending', 'approved',
 * 'changes_requested', 'resolved'), which is a different column on a different table.
 */
export const POST_STATUSES = ['draft', 'pending_review', 'approved', 'scheduled'] as const

export type PostStatus = (typeof POST_STATUSES)[number]

/**
 * A post's status is now purely EDITORIAL — it ends at 'scheduled'.
 *
 * 'publishing', 'published' and 'failed' used to live here too, and moved onto
 * `post_publications.status` when a post gained more than one destination. They could not
 * stay: a post live on Instagram and failed on Facebook has two answers, and one column can
 * only hold one of them. `publishStateOf` reduces the destinations to a single word for the
 * surfaces that show one.
 *
 * This also retires `USER_SETTABLE_POST_STATUSES`, which existed to exclude exactly those
 * three from generic updates. With the publishing lifecycle out of this column there is
 * nothing left to exclude — every status here is one a user may legitimately set.
 */

/**
 * The *connection* vocabulary: how social_connections.platform and the Meta OAuth
 * flow spell things.
 *
 * It used to be defined against a second list — PLATFORMS, five selectable display-case
 * names that `posts.platform` stored. That column and that list are both gone: a post is
 * not written for a network, so the only platform vocabulary left is this one.
 */
export const POST_PLATFORMS = ['instagram'] as const

export type PostPlatform = (typeof POST_PLATFORMS)[number]

/**
 * The connection's network, canonically spelled — or null when the row is not one we
 * publish to.
 *
 * Canva rows share `social_connections` and reach every list of a client's connections,
 * so "has a connection" and "has somewhere to publish" are different questions. This is
 * what tells them apart, for the roster's channel chips and the wizard's run panel alike.
 *
 * Tolerates display case so a hand-fixed or legacy row still matches.
 */
export function toPublishingPlatform(platform: string | null | undefined): PostPlatform | null {
  return POST_PLATFORMS.find((p) => p === platform?.toLowerCase()) ?? null
}

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

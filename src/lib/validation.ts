import { PLATFORMS } from '@/utils/constants'

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
export const POST_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const

export type PostStatus = (typeof POST_STATUSES)[number]

/**
 * Statuses a user may set through generic post updates. Pipeline-owned statuses
 * ('publishing', 'published', 'failed') are excluded — those must only be set by
 * the publish flow, otherwise stats and the scheduler can be corrupted.
 */
export const USER_SETTABLE_POST_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'scheduled',
] as const satisfies readonly PostStatus[]

/**
 * The *connection* vocabulary: how social_connections.platform and the Meta OAuth
 * flow spell things. Not the same list as PLATFORMS in utils/constants, which is the
 * *post* vocabulary (five selectable names in display case) — posts.platform uses that
 * one. The two describe different tables and must not be derived from each other.
 */
export const POST_PLATFORMS = ['instagram'] as const

/** Discard-reason values — must mirror the discarded_drafts.reason check constraint (migration 20260805). */
export const DISCARD_REASONS = [
  'off_brand',
  'repetitive',
  'wrong_facts',
  'weak_source',
  'bad_timing',
] as const

export type DiscardReason = (typeof DISCARD_REASONS)[number]

export function isUserSettablePostStatus(value: string): boolean {
  return (USER_SETTABLE_POST_STATUSES as readonly string[]).includes(value)
}

/**
 * The one gate for posts.platform. PLATFORMS is the single source of truth: the value
 * originates there (a selector choice, stored as a weekly_mix_json key and read back by
 * extractPlatformFromMix), so an exact match is the right test — anything else is not a
 * value the product can produce.
 *
 * Exact, not case-insensitive. Accepting 'instagram' here is what let a second spelling
 * into the column, and the calendar's `platform === 'Instagram'` test then silently
 * failed for those rows. Callers store the value as-is; passing this check *is* canonical.
 *
 * All five names pass, not just the publishable two — Kontuur writes for LinkedIn/X/TikTok
 * and only declines to publish there (see LIVE_PLATFORMS).
 */
export function isValidPostPlatform(value: string): boolean {
  return (PLATFORMS as readonly string[]).includes(value)
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

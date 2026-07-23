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
] as const

export const POST_PLATFORMS = ['instagram', 'facebook'] as const

export function isUserSettablePostStatus(value: string): boolean {
  return (USER_SETTABLE_POST_STATUSES as readonly string[]).includes(value)
}

/** Case-insensitive: the UI and stored rows use display case ('Instagram'), older rows lowercase. */
export function isValidPostPlatform(value: string): boolean {
  return (POST_PLATFORMS as readonly string[]).includes(value.toLowerCase())
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

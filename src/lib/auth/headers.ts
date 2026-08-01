/**
 * The request header carrying the user id that middleware has already validated.
 *
 * One definition, shared by the middleware that sets it and the session helper that reads it —
 * a literal in both places would drift silently and fail open, since a header that is never
 * matched simply reads as "no user".
 *
 * Only trustworthy because `updateSession` deletes any inbound value before validating and sets
 * it only afterwards. Nothing outside that function may write it.
 */
export const AUTH_USER_ID_HEADER = 'x-kontuur-user-id'

/**
 * The signed-in person's display name, percent-encoded.
 *
 * Encoded because header values are latin1: a Cyrillic name — the common case for this product —
 * throws on `headers.set()` if written raw.
 */
export const AUTH_USER_NAME_HEADER = 'x-kontuur-user-name'

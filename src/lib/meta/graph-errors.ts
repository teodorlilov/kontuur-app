/**
 * Graph API failure classification — the single place an error code becomes a
 * decision. Every Meta call used to collapse failures into one opaque string,
 * so an expired token, a rate limit and a bad JPEG were retried identically;
 * these categories are what the publish retry ladder and the token refresher
 * branch on.
 */

/** The decision a Graph failure maps to. */
export type GraphFailure =
  | 'token_invalid' // the stored token is dead — reconnect, never retry with it
  | 'permission' // scope / App Review problem — retrying cannot help
  | 'rate_limited' // back off and retry later
  | 'media_invalid' // the media itself is rejected — permanent for this post
  | 'transient' // Meta-side hiccup — retry with spacing
  | 'permanent' // anything else that will not resolve on its own

/** The error envelope Meta returns, normalised. */
export interface GraphErrorShape {
  httpStatus: number
  code: number | null
  subcode: number | null
  type: string | null
  message: string
  fbtraceId: string | null
}

const TOKEN_INVALID_CODES = new Set([102, 190, 463, 467])
const PERMISSION_CODES = new Set([3, 10, 200])
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])
const MEDIA_INVALID_CODES = new Set([9004])
const TRANSIENT_CODES = new Set([1, 2])

/** Map a normalised Graph error to the decision its caller should take. */
export function classifyGraphError(err: GraphErrorShape): GraphFailure {
  if (err.code !== null) {
    if (TOKEN_INVALID_CODES.has(err.code)) return 'token_invalid'
    if (PERMISSION_CODES.has(err.code)) return 'permission'
    if (RATE_LIMIT_CODES.has(err.code)) return 'rate_limited'
    if (MEDIA_INVALID_CODES.has(err.code)) return 'media_invalid'
    // 2207001..2207999 — the media-processing family (bad format, bad aspect
    // ratio, fetch failure at Meta's end). Permanent for this media.
    if (err.code >= 2207000 && err.code < 2208000) return 'media_invalid'
    if (TRANSIENT_CODES.has(err.code)) return 'transient'
  }
  if (err.httpStatus === 429) return 'rate_limited'
  if (err.httpStatus >= 500) return 'transient'
  return 'permanent'
}

/** Whether a failure is worth another attempt after spacing. */
export function isRetryableFailure(failure: GraphFailure): boolean {
  return failure === 'transient' || failure === 'rate_limited'
}

/** A Graph call that failed, carrying its classification. */
export class GraphApiError extends Error {
  readonly shape: GraphErrorShape
  readonly failure: GraphFailure

  constructor(shape: GraphErrorShape) {
    super(shape.message)
    this.name = 'GraphApiError'
    this.shape = shape
    this.failure = classifyGraphError(shape)
  }
}

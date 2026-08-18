import 'server-only'

import type { z } from 'zod'
import { GraphApiError, isRetryableFailure, type GraphErrorShape } from './graph-errors'

/**
 * The one HTTP chokepoint for Meta Graph calls. Tokens travel in the
 * Authorization header, never in the URL — every earlier call site put the
 * long-lived token in a query string, which leaks it into logs and proxies.
 * Responses are zod-parsed, never asserted: swallowed shape changes are how the
 * analytics layer returned zeros for months without anyone noticing.
 */

const REQUEST_TIMEOUT_MS = 15_000
/** Two retries with spacing — a cron tick has a 240s budget, not patience. */
const MAX_RETRIES = 2
const BACKOFF_BASE_MS = 1_000
const RETRY_AFTER_CAP_MS = 10_000

interface GraphRequestOptions {
  method: 'GET' | 'POST'
  token: string
  body?: Record<string, unknown>
  searchParams?: Record<string, string>
}

/** Extract Meta's error envelope from a failed response body, tolerating any shape. */
function toErrorShape(httpStatus: number, raw: unknown): GraphErrorShape {
  const err =
    raw && typeof raw === 'object' && 'error' in raw
      ? (raw as { error: Record<string, unknown> }).error
      : null
  return {
    httpStatus,
    code: typeof err?.code === 'number' ? err.code : null,
    subcode: typeof err?.error_subcode === 'number' ? err.error_subcode : null,
    type: typeof err?.type === 'string' ? err.type : null,
    message:
      typeof err?.message === 'string' ? err.message : `Graph request failed (HTTP ${httpStatus})`,
    fbtraceId: typeof err?.fbtrace_id === 'string' ? err.fbtrace_id : null,
  }
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
  if (!Number.isNaN(retryAfter) && retryAfter > 0) return Math.min(retryAfter, RETRY_AFTER_CAP_MS)
  return BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 250
}

async function graphRequest<Schema extends z.ZodType>(
  schema: Schema,
  url: string,
  options: GraphRequestOptions
): Promise<z.infer<Schema>> {
  let lastError: GraphApiError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response
    try {
      const target = new URL(url)
      for (const [key, value] of Object.entries(options.searchParams ?? {})) {
        target.searchParams.set(key, value)
      }
      res = await fetch(target, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      // Network failure / timeout — transient by definition.
      lastError = new GraphApiError({
        httpStatus: 0,
        code: null,
        subcode: null,
        type: 'network',
        message: err instanceof Error ? err.message : 'Graph request failed to send',
        fbtraceId: null,
      })
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt, null)))
        continue
      }
      throw lastError
    }

    const raw: unknown = await res.json().catch(() => null)

    // Meta can return an error envelope with HTTP 200; treat both alike.
    const hasErrorEnvelope = !!raw && typeof raw === 'object' && 'error' in raw
    if (!res.ok || hasErrorEnvelope) {
      lastError = new GraphApiError(toErrorShape(res.status, raw))
      if (isRetryableFailure(lastError.failure) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt, res.headers.get('retry-after'))))
        continue
      }
      throw lastError
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new GraphApiError({
        httpStatus: res.status,
        code: null,
        subcode: null,
        type: 'shape',
        message: `unrecognised Graph response shape for ${new URL(url).pathname}`,
        fbtraceId: null,
      })
    }
    return parsed.data
  }

  // Unreachable: every loop exit either returns or throws.
  throw lastError ?? new Error('Graph request failed')
}

/** GET a Graph resource; the token rides in the Authorization header. */
export function graphGet<Schema extends z.ZodType>(
  schema: Schema,
  url: string,
  token: string,
  searchParams?: Record<string, string>
): Promise<z.infer<Schema>> {
  return graphRequest(schema, url, { method: 'GET', token, searchParams })
}

/** POST to a Graph endpoint with a JSON body; the token rides in the header. */
export function graphPost<Schema extends z.ZodType>(
  schema: Schema,
  url: string,
  token: string,
  body: Record<string, unknown>
): Promise<z.infer<Schema>> {
  return graphRequest(schema, url, { method: 'POST', token, body })
}

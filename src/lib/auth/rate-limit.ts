/**
 * In-memory rate limiter for API routes: request counts per key, fixed window.
 *
 * WHAT IT ACTUALLY ENFORCES ON VERCEL. The store is a module-level Map, so it lives in
 * one lambda instance. Under concurrency each instance keeps its own counts and the real
 * ceiling is `max × warm instances`, not `max`. This is a **runaway-loop guard** — it
 * stops a client retrying in a tight loop against the instance it is already talking to —
 * and it is NOT a spend ceiling. Do not add a limit here and describe it as a budget; a
 * budget needs shared state (Postgres or Upstash) and is a deliberate change, not a
 * constant edit. (The header used to say "suitable for single-instance deployments",
 * which was true of the code and false of where it runs. TECH-DEBT §B6.)
 */
import { NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Periodically clean expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60_000
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}, CLEANUP_INTERVAL_MS).unref()

interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number
  /** Window duration in milliseconds */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check and consume one request against the rate limit for a given key.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.max - entry.count, resetAt: entry.resetAt }
}

/** Default config for AI endpoints: 20 requests per minute per user */
export const AI_RATE_LIMIT: RateLimitConfig = { max: 20, windowMs: 60_000 }

/**
 * The 429 for a user who exhausted the per-minute model-call budget, or null when
 * allowed. `scope` keys the pool, so two endpoints named differently do not share one.
 *
 * Exists because seven routes had each written the same three lines around
 * `checkRateLimit`, which is how two of them (detect-slop, analyze-url) came to make
 * paid model calls with no limit at all — nothing looked missing at any single call site.
 */
export function aiRateLimitResponse(scope: string, userId: string): NextResponse | null {
  const rl = checkRateLimit(`ai:${scope}:${userId}`, AI_RATE_LIMIT)
  if (rl.allowed) return null
  return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
}

/** Image generation (paid ~52s gpt-image-2 calls): legitimate max throughput is ~6-7/min at
 *  concurrency 6, so 60 per 10 minutes never throttles real use but stops runaway loops.
 *  Private — every route consumes the pool through visualsRateLimitResponse. */
const VISUALS_RATE_LIMIT: RateLimitConfig = { max: 60, windowMs: 10 * 60_000 }

/** The 429 for a user who exhausted the shared visuals budget, or null when allowed — every
 *  paid-generation route (generate, cutout, inpaint, vector) consumes this one pool. */
export function visualsRateLimitResponse(userId: string): NextResponse | null {
  const rl = checkRateLimit(`visuals:${userId}`, VISUALS_RATE_LIMIT)
  if (rl.allowed) return null
  return NextResponse.json({ error: 'Too many visual generations. Please wait a few minutes.' }, { status: 429 })
}

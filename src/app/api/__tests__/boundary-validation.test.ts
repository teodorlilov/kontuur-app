import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Route bodies are parsed, not trusted.
 *
 * CLAUDE.md: "Every boundary input is zod-validated: form data, server action args,
 * route handler bodies, third-party API responses." It was unenforced, and
 * PUT /api/settings/account read `timezone` straight off `await request.json()` and
 * wrote it to the column. The generate cron then handed that value to
 * `Intl.DateTimeFormat`, which throws on an unknown zone — from inside a `.flatMap()`
 * that sits OUTSIDE the per-client try, so one bad row would have aborted generation
 * for every client on the tick.
 *
 * A hand-rolled `typeof x !== 'string'` check is not validation either: the same route
 * had one for `name` and still shipped the hole for `timezone`.
 */

const API = path.resolve(__dirname, '..')

/** Reads a body. */
const READS_BODY = /request\.json\(\)/
/** Hands it to a zod schema. */
const PARSES = /\.(safeParse|parse)\s*\(/

/**
 * Routes that read a body without a schema, each for a reason.
 *
 * "It is a small body" is not a reason — the timezone that could have taken down the
 * whole generate cron was one optional string.
 */
const EXEMPT: Record<string, string> = {
  'meta/data-deletion/route.ts':
    'The body carries one field, signed_request, accepted as either form-encoded or JSON. Its contents are verified by HMAC-SHA256 against the app secret with timingSafeEqual — a stronger check than a shape schema, and the shape itself is a single string.',
}

/**
 * Routes that read a body without a schema, from before this guard existed. NOT
 * exemptions — these are debt, and the list may only ever shrink.
 *
 * Not fixed here because adding a schema changes what each route accepts, which is a
 * behavioural change per route and wants its own review. `posts/[id]/route.ts` is the
 * clearest case of why the rule exists: it hand-rolls checks for status and platform,
 * which reads as validated, while every other field goes through untouched.
 *
 * To clear one: add a schema in the feature's schemas.ts, parse the body with it, then
 * delete its line. The staleness check below fails if you fix it and forget.
 * Rationale per entry: docs/TECH-DEBT.md §7.4.
 */
const KNOWN_UNVALIDATED: string[] = [
  'ai/best-time/route.ts',
  'ai/detect-slop/route.ts',
  'ai/generate-svg/route.ts',
  'ai/generate-visual/route.ts',
  'ai/intelligence/tip/route.ts',
  'ai/isolate-subject/route.ts',
  'ai/paste-from-url/route.ts',
  'ai/rewrite/route.ts',
  'ai/suggest-sources/route.ts',
  'canva/designs/[designId]/export/route.ts',
  'extract/start/route.ts',
  'posts/[id]/images/route.ts',
  'posts/[id]/route.ts',
  'sources/discover/route.ts',
]

function routeFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full)
      } else if (entry.name === 'route.ts') {
        out.push(full)
      }
    }
  }
  walk(API)
  return out
}

describe('route handler bodies', () => {
  const routes = routeFiles()

  it('finds the route handlers', () => {
    // A walker that matched nothing would make the assertion below vacuous.
    expect(routes.length).toBeGreaterThan(20)
  })

  /** Routes that read a body and never hand it to a schema. */
  const unvalidated = routes
    .map((f) => path.relative(API, f))
    .filter((rel) => {
      const src = readFileSync(path.join(API, rel), 'utf8')
      return READS_BODY.test(src) && !PARSES.test(src)
    })

  it('has no NEW route reading a body without a schema', () => {
    const allowed = new Set([...Object.keys(EXEMPT), ...KNOWN_UNVALIDATED])
    // Add a schema in the feature's schemas.ts and parse the body with it, or add the
    // route to EXEMPT with the reason its input is proven some other way.
    expect(unvalidated.filter((rel) => !allowed.has(rel))).toEqual([])
  })

  it('has no stale KNOWN_UNVALIDATED entry', () => {
    // Fixing a route without deleting its line would leave the backlog looking larger
    // than it is, and quietly re-permit the route later.
    const stale = KNOWN_UNVALIDATED.filter((rel) => !unvalidated.includes(rel))
    expect(stale).toEqual([])
  })

  it('has no stale EXEMPT entry', () => {
    const existing = new Set(routes.map((f) => path.relative(API, f)))
    const stale = Object.keys(EXEMPT).filter((rel) => !existing.has(rel))
    expect(stale).toEqual([])
  })

  it('every exemption explains itself', () => {
    for (const [route, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${route} needs a real reason`).toBeGreaterThan(40)
    }
  })
})

import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Server action arguments are parsed, not trusted.
 *
 * The sibling guard (`app/api/__tests__/boundary-validation.test.ts`) walks route files
 * only. CLAUDE.md names three boundaries — "form data, server action args, route handler
 * bodies" — and exactly one of them was enforced, so the rule held everywhere a test
 * looked and nowhere else.
 *
 * What that cost: `submitApproval` is one of two unauthenticated writes in the app. It is
 * authorised by a URL token, runs on the service-role client, and took
 * `postNotes: Array<{postId, note}>` with no schema, no array cap and no string cap,
 * writing each straight to `client_note`. Its `status` argument WAS hand-checked with a
 * `!==` pair — which is the same tell §7.4 documents at the route layer: a hand-rolled
 * check on one field reads as validation while every other argument passes through.
 *
 * The rule: a `'use server'` file whose exported actions take arguments must hand them to
 * a schema. Actions that take none have no boundary to guard.
 */

const FEATURES = path.resolve(__dirname, '..')
const LIB_ACTIONS = path.resolve(__dirname, '../../lib/actions')

/** Hands an argument to zod, directly or through a named parser. */
const PARSES = /\.(safeParse|parse)\s*\(|\bparse[A-Z]\w*\s*\(/

/** An exported action that declares at least one parameter. */
const ACTION_WITH_ARGS = /export\s+async\s+function\s+\w+\s*\(\s*[^)]*\w+\s*:/

/**
 * Action files that take arguments without a schema, each for a reason.
 *
 * "The id is only used in an .eq()" is not a reason — that was true of every entry
 * cleared when this guard was written, and a non-uuid reaching `.eq()` makes Postgres
 * reject the comparison, so the action reports a database error where it means
 * "that is not an id".
 */
const EXEMPT: Record<string, string> = {
  'sources/actions/source-actions.ts':
    'Validates through purpose-built checkers rather than zod: validateSourceUrl (SSRF + scheme + host), isValidRssUrl (feed reachability) and validateUpload (MIME + size + extension). Each proves something about the value that a shape schema cannot, and all three run before any write.',
}

function actionFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full)
      } else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        if (readFileSync(full, 'utf8').includes("'use server'")) out.push(full)
      }
    }
  }
  walk(FEATURES)
  walk(LIB_ACTIONS)
  return out
}

describe('server action arguments', () => {
  const files = actionFiles()

  it('finds the action files', () => {
    // A walker that matched nothing would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(10)
  })

  /** Action files that take arguments and never hand them to a schema. */
  const unvalidated = files
    .map((f) => path.relative(FEATURES, f))
    .filter((rel) => {
      const src = readFileSync(path.resolve(FEATURES, rel), 'utf8')
      return ACTION_WITH_ARGS.test(src) && !PARSES.test(src)
    })

  it('has no action taking arguments without a schema', () => {
    // Add a schema in the feature's schemas.ts (or parseActionId for a bare id), or add
    // the file to EXEMPT with the reason its input is proven some other way.
    expect(unvalidated.filter((rel) => !(rel in EXEMPT))).toEqual([])
  })

  it('has no stale EXEMPT entry', () => {
    const existing = new Set(files.map((f) => path.relative(FEATURES, f)))
    expect(Object.keys(EXEMPT).filter((rel) => !existing.has(rel))).toEqual([])
  })

  it('every exemption explains itself', () => {
    for (const [file, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${file} needs a real reason`).toBeGreaterThan(40)
    }
  })
})

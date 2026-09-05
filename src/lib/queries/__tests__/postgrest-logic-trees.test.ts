import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * A PostgREST logic tree may only name columns of the table being queried.
 *
 * `or=(...)` and `and=(...)` are parsed before any join is resolved, so a condition naming an
 * embedded resource — `post_publications.published_at.gte.X` — is not a filter that returns
 * nothing. It is a syntax error, and it fails the WHOLE query:
 *
 *   failed to parse logic tree ((and(scheduled_at.gte.…,scheduled_at.lt.…),
 *   post_publications.published_at.gte.…)) (line 1, column 110)
 *
 * Two of these shipped together when the publish path was re-rooted from `posts` onto
 * `post_publications`: a filter that read as a parent column on the old table became an embedded
 * reference on the new one. One blanked the dashboard's coverage grid for every client; the other
 * was in the cron's due-publications query, where it would have thrown on every tick and published
 * nothing at all. Typecheck, lint, knip and 1,837 tests were green through both.
 *
 * Filtering the parent by an embedded column is spelled as a SEPARATE filter beside `!inner`
 * (`.eq('post_publications.status', 'published')` with `post_publications!inner(...)`), which is
 * legal precisely because it is not inside a logic tree.
 *
 * The walker is local, as it is in the eight other guard suites. Extracting one shared crawler is
 * worth doing and is not this fix's job.
 */

const SRC = path.resolve(__dirname, '../../..')

/** Every PostgREST operator that can close a `column.operator.value` condition. */
const OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'match',
  'imatch',
  'in',
  'is',
  'isdistinct',
  'fts',
  'plfts',
  'phfts',
  'wfts',
  'cs',
  'cd',
  'ov',
  'sl',
  'sr',
  'nxr',
  'nxl',
  'adj',
] as const

const OPERATOR_SET = new Set<string>([...OPERATORS, 'not'])

/**
 * `table.column.operator.` — an embedded reference.
 *
 * The trailing dot is what makes this precise: every condition puts a value after its operator,
 * so a real one always has it. It is also what keeps ordinary TypeScript out — `a.b.gte(x)` is a
 * call, not a filter.
 */
const EMBEDDED_CONDITION =
  /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is|isdistinct|fts|plfts|phfts|wfts|cs|cd|ov|sl|sr|nxr|nxl|adj)\./g

/**
 * The embedded references in one logic-tree argument, or none.
 *
 * The middle segment must not itself be an operator, which is what tells
 * `publish_ref.not.is.null` (a legal negated parent filter) from
 * `posts.scheduled_at.lt.X` (an embedded reference).
 */
export function embeddedReferencesIn(filter: string): string[] {
  const found: string[] = []
  for (const match of filter.matchAll(EMBEDDED_CONDITION)) {
    const [whole, , column] = match
    if (column && !OPERATOR_SET.has(column)) found.push(whole.slice(0, -1))
  }
  return found
}

function walkSources(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push({ file: path.relative(SRC, full), body: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(SRC)
  return out
}

const OWN_FILE = path.join('lib', 'queries', '__tests__', 'postgrest-logic-trees.test.ts')

describe('the detector', () => {
  it('catches the two references that actually shipped', () => {
    expect(
      embeddedReferencesIn(
        'and(scheduled_at.gte.2026-08-30T21:00:00.000Z,scheduled_at.lt.2026-09-06T21:00:00.000Z),' +
          'post_publications.published_at.gte.2026-08-30T21:00:00.000Z'
      )
    ).toEqual(['post_publications.published_at.gte'])

    expect(
      embeddedReferencesIn(
        'and(status.eq.publishing,publish_claimed_at.is.null,posts.scheduled_at.lt.2026-09-01T00:00:00.000Z)'
      )
    ).toEqual(['posts.scheduled_at.lt'])
  })

  it('passes the legal filters the repo actually writes', () => {
    // A negated parent filter. `not` sits where a column would, which is the case that makes a
    // naive two-dots-then-operator rule cry wolf.
    expect(embeddedReferencesIn('and(status.eq.publishing,publish_ref.not.is.null)')).toEqual([])
    // Dotted VALUES. A millisecond timestamp is three dots of pure noise.
    expect(
      embeddedReferencesIn(
        'visuals_attempted_at.is.null,visuals_attempted_at.lt.2026-09-01T10:30:00.000Z'
      )
    ).toEqual([])
    expect(embeddedReferencesIn('visual_ground.is.null,visual_accent.is.null')).toEqual([])
    expect(embeddedReferencesIn('quality_score_avg.is.null,quality_score_avg.gte.6')).toEqual([])
    // Nested trees of parent columns.
    expect(
      embeddedReferencesIn(
        'and(status.eq.scheduled,or(publish_claimed_at.is.null,publish_claimed_at.lt.2026-09-01T10:00:00.000Z))'
      )
    ).toEqual([])
  })
})

describe('no logic tree names an embedded resource', () => {
  it('found the queries it means to be guarding', () => {
    // A path typo, or a walker that quietly returns nothing, makes the sweep below pass by
    // scanning an empty tree. Both files named here really do call `.or()`.
    const sources = walkSources()
    expect(sources.length).toBeGreaterThan(400)

    const withLogicTrees = sources.filter(({ body }) => body.includes('.or(')).map((s) => s.file)
    expect(withLogicTrees).toContain(path.join('features', 'publishing', 'lib', 'scheduler.ts'))
    expect(withLogicTrees).toContain(path.join('app', 'api', 'cron', 'visuals', 'route.ts'))
  })

  it('holds across every .or() in the tree', () => {
    const offenders: string[] = []

    for (const { file, body } of walkSources()) {
      if (file === OWN_FILE || !body.includes('.or(')) continue

      body.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        // Prose may describe the bug; code may not reproduce it.
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        for (const reference of embeddedReferencesIn(line)) {
          offenders.push(`src/${file}:${index + 1} — ${reference}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})

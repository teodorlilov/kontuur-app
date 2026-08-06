import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Hand-written mirrors of database rows, forbidden.
 *
 * CLAUDE.md has said "never define the same value twice" since before these types
 * existed, and it was unenforceable the whole time. A migration in May made
 * posts.platform, posts.post_type and clients.language NOT NULL; the generated types
 * updated, and nine hand-written copies across types/api.ts, lib/queries/db.ts and
 * four page files did not. They kept declaring `| null` for three months, and every
 * read site carried a `??` fallback for a state the database could no longer produce.
 * Nothing failed when the tenth copy appeared.
 *
 * The rule: a type whose fields are all columns of one table is a projection of that
 * table, and must be derived from the generated row type — `Pick<PostRow, …>`,
 * `Omit<ClientRow, …>`, `Tables<'posts'>` — so a schema change reaches it as a build
 * error instead of silent drift.
 */

const SRC = path.resolve(__dirname, '../..')
const DATABASE_TS = path.join(SRC, 'types/database.ts')

/**
 * How many of a declaration's fields must be columns of one table before it counts as
 * a mirror. Below this, overlap is coincidence — plenty of unrelated types have an
 * `id` and a `name`.
 */
const MIN_FIELDS = 5

/**
 * Declarations that share a table's field names but are not projections of it.
 *
 * Every entry deliberately says something the column types cannot. "It was quicker to
 * write out" is not on this list and must not be added to it.
 */
const EXEMPT: Record<string, string> = {
  'ai/generation/types.ts:DraftPost':
    'A draft before it is a row, deliberately narrower than the columns: status is the literal "draft", post_type and source_type are unions, and caption/topic_summary/quality_score_avg are non-null because the generator guarantees them. Deriving would widen all of it back.',
  'lib/actions/post-actions.ts:UpdatePostInput':
    'A write contract — which fields may be updated — not a row. Deriving would turn source_url?: string into string | null and start admitting nulls the update path never intended.',
  'features/publishing/lib/scheduler.ts:PublishStatusPatch':
    'A partial update payload: every field is optional because each caller patches a different subset (markPublished sets four, markFailed three). The optionality means "may be omitted from this patch", not "may be null in the column".',
  'features/sources/actions/source-actions.ts:UpdateSourceInput':
    'A write contract, all fields optional so a caller can send only what changed. Same reason as UpdatePostInput.',
  'features/generate/hooks/use-draft-visuals.ts:DraftPostInput':
    "A structural contract deliberately satisfied by BOTH PostData and DraftPost, so it cannot be tied to either. slides_json is `unknown` rather than the column's Json for exactly that reason.",
}

/**
 * Pre-existing mirrors, from before this guard existed. NOT exemptions — these are
 * debt, and the list may only ever shrink.
 *
 * They are not fixed here because deriving them surfaces real nullability the app has
 * never handled: AgencyInfo alone asserts non-null on five columns the schema allows
 * to be null, and correcting that is a behavioural change, not a typing one.
 *
 * To clear one: derive it, then delete its line. The staleness check below fails if
 * you derive it and forget. Rationale per entry: docs/TECH-DEBT.md §7.3.
 */
const KNOWN_MIRRORS: string[] = [
  'app/api/cron/generate/helpers.ts:BrandProfileRow',
  'app/api/cron/generate/helpers.ts:ClientRow',
  'app/api/cron/generate/helpers.ts:ScheduleRow',
  'features/analytics/components/report-history.tsx:ReportHistoryEntry',
  'features/dashboard/types.ts:DashboardBriefing',
  'lib/queries/db.ts:ClientSourceRow',
  'lib/queries/db.ts:ClientSourceSummary',
  'types/api.ts:AgencyInfo',
  'types/api.ts:AnalyticsReport',
  'types/api.ts:EnrichedNotification',
  'types/api.ts:MetaConnection',
  'types/sources.ts:ClientSource',
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full)
      } else if (/\.tsx?$/.test(entry.name) && entry.name !== 'database.ts') {
        out.push(full)
      }
    }
  }
  walk(SRC)
  return out
}

/** Column names per table, read from the generated `Row:` blocks. */
function tableColumns(): Map<string, Set<string>> {
  const lines = readFileSync(DATABASE_TS, 'utf8').split('\n')
  const tables = new Map<string, Set<string>>()
  let table: string | null = null
  let inRow = false

  for (const line of lines) {
    const declared = line.match(/^ {6}([a-z_]+): \{\s*$/)
    if (declared) {
      table = declared[1] ?? null
      continue
    }
    if (table && /^ {8}Row: \{\s*$/.test(line)) {
      inRow = true
      tables.set(table, new Set())
      continue
    }
    if (!inRow) continue
    if (/^ {8}\}/.test(line)) {
      inRow = false
      continue
    }
    const field = line.match(/^ {10}([a-zA-Z_]+)\??:/)
    if (field?.[1] && table) tables.get(table)?.add(field[1])
  }
  return tables
}

interface Declaration {
  key: string
  name: string
  file: string
  line: number
  fields: string[]
  /** Full declaration text — used to spot an existing derivation. */
  body: string
}

/** Every `interface X {}` / `type X = {}` in src, with its top-level field names. */
function declarations(files: string[]): Declaration[] {
  const found: Declaration[] = []
  const DECL = /(?:export\s+)?(?:interface\s+(\w+)|type\s+(\w+)\s*=)\s*\{/g

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    let match: RegExpExecArray | null
    while ((match = DECL.exec(src))) {
      const name = match[1] ?? match[2]
      if (!name) continue
      const open = src.indexOf('{', match.index + match[0].length - 1)

      let depth = 0
      let end = open
      for (; end < src.length; end++) {
        if (src[end] === '{') depth++
        else if (src[end] === '}') {
          depth--
          if (depth === 0) break
        }
      }

      const body = src.slice(open + 1, end)
      const fields: string[] = []
      let nested = 0
      for (const raw of body.split('\n')) {
        const field = raw.trim().match(/^(\w+)\??\s*:/)
        if (nested === 0 && field?.[1]) fields.push(field[1])
        nested += (raw.match(/[{[(]/g) ?? []).length - (raw.match(/[}\])]/g) ?? []).length
      }

      const rel = path.relative(SRC, file)
      found.push({
        key: `${rel}:${name}`,
        name,
        file: rel,
        line: src.slice(0, match.index).split('\n').length,
        fields,
        body: src.slice(match.index, end + 1),
      })
    }
  }
  return found
}

/** Whether a declaration already derives from the generated types. */
function isDerived(decl: Declaration): boolean {
  return /\b(Pick|Omit)\s*<\s*\w*Row\b|Tables<'/.test(decl.body)
}

/** Declarations whose fields are all columns of a single table. */
function mirrors(decls: Declaration[], tables: Map<string, Set<string>>) {
  const out: Array<{ decl: Declaration; table: string }> = []
  for (const decl of decls) {
    if (decl.fields.length < MIN_FIELDS) continue
    if (isDerived(decl)) continue
    for (const [table, columns] of tables) {
      if (decl.fields.every((f) => columns.has(f))) {
        out.push({ decl, table })
        break
      }
    }
  }
  return out
}

describe('database row mirrors', () => {
  const tables = tableColumns()
  const decls = declarations(sourceFiles())
  const found = mirrors(decls, tables)

  it('reads the generated table columns', () => {
    // A parser that silently matched nothing would make every assertion below pass.
    expect(tables.size).toBeGreaterThan(20)
    expect(tables.get('posts')?.size ?? 0).toBeGreaterThan(20)
  })

  it('finds declarations to check', () => {
    expect(decls.length).toBeGreaterThan(100)
  })

  it('has no NEW hand-written mirror of a database row', () => {
    const allowed = new Set([...Object.keys(EXEMPT), ...KNOWN_MIRRORS])
    const offenders = found
      .filter(({ decl }) => !allowed.has(decl.key))
      .map(
        ({ decl, table }) =>
          `${decl.file}:${decl.line} — ${decl.name} (${decl.fields.length} fields, all columns of "${table}")`
      )

    // Derive it (`Pick<PostRow, …>`), or add it to EXEMPT with the reason it is not a
    // projection. Writing the columns out again is the one option that is not
    // available — that is what drifted for three months.
    expect(offenders).toEqual([])
  })

  it('has no stale KNOWN_MIRRORS entry', () => {
    // Fixing a mirror without deleting its line would leave the backlog looking
    // larger than it is, and quietly re-permit the name later.
    const stillMirrors = new Set(found.map(({ decl }) => decl.key))
    const stale = KNOWN_MIRRORS.filter((key) => !stillMirrors.has(key))
    expect(stale).toEqual([])
  })

  it('has no stale EXEMPT entry', () => {
    const declared = new Set(decls.map((d) => d.key))
    const stale = Object.keys(EXEMPT).filter((key) => !declared.has(key))
    expect(stale).toEqual([])
  })

  it('every exemption explains itself', () => {
    for (const [key, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${key} needs a real reason`).toBeGreaterThan(40)
    }
  })
})

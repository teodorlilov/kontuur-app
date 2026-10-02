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
 *
 * Three, not five. The 2026-08-31 column audit found real mirrors sitting under the old floor and
 * therefore invisible: WeekScheduledPost (2 fields, narrowing a nullable `scheduled_at` on the
 * strength of a query filter), TokenRow (3), PublishableImage (3, and the thing publish reads to
 * refuse a carousel). A small projection drifts exactly like a large one.
 */
const MIN_FIELDS = 3

/**
 * How many fields may NOT be columns before a declaration stops counting as a mirror.
 *
 * One. The rule used to be "every field is a column", and a single extra field disabled the check
 * outright — which is how `ReviewQueueRow` got away with `caption: string` over a nullable column
 * for as long as it carried an `imageUrl` beside it. A projection plus one joined or computed
 * field is the common shape, not an exception: derive the projection and intersect the extra.
 */
const MAX_NON_COLUMN_FIELDS = 1

/**
 * Declarations that share a table's field names but are not projections of it.
 *
 * Every entry deliberately says something the column types cannot. "It was quicker to
 * write out" is not on this list and must not be added to it.
 */
const EXEMPT: Record<string, string> = {
  'ai/generation/types.ts:DraftPost':
    'A draft before it is a row, deliberately narrower than the columns: status is the literal "draft", post_type and source_type are unions, and caption/topic_summary/quality_score_avg are non-null because the generator guarantees them. Deriving would widen all of it back.',
  // `UpdatePostInput`, cited below, is now `z.infer<typeof updatePostSchema>`
  // (lib/validation/post-update-schema.ts), which this scanner cannot read.
  'features/sources/actions/source-actions.ts:UpdateSourceInput':
    'A write contract, all fields optional so a caller can send only what changed. Same reason as UpdatePostInput.',

  // The three below narrow a structurally-untyped `Json` column into the shape the app
  // actually writes. Deriving them would replace a useful assertion with `Json` and
  // push a cast to every use — strictly worse. Same posture as PostData.slides_json.
  'types/sources.ts:ClientSource':
    'Narrows three columns on purpose: `type` to a four-way union, and config/pillar_ids from the column type `Json` to Record<string, unknown> / string[].',
  'lib/queries/db.ts:ClientSourceRow':
    'Same narrowing as ClientSource — config and pillar_ids are `Json` in the column and Record<string, unknown> / string[] here.',
  'lib/queries/db.ts:ClientSourceSummary':
    'Same narrowing as ClientSource — pillar_ids is `Json` in the column and string[] here.',
  'lib/visual/queries.ts:ExtractionPatch':
    'A write contract, not a row: every field but `status` is optional so a status-only "pending" write never references identity/report, and `status` is narrowed to its four literals. Same reason as UpdateSourceInput. (PublishStatusPatch made the same argument until publishing moved to post_publications, where `PublicationPatch` is derived from the row instead — a partial of a derived type, which this scanner is happy with and which cannot drift.)',
}

/**
 * Mirrors that predate this guard: debt, not exemptions, and the list may only ever shrink.
 *
 * It is empty. Every mirror the guard has surfaced is derived, `AgencyInfo` included — it is
 * `AgencyColumns` (src/types/api.ts). A new mirror is derived, or goes in EXEMPT with the
 * reason it is not a projection; it never goes here. The array stays, empty, so that rule has a
 * place to be read, and the staleness check below still fails on an entry that is no longer a
 * mirror. Rationale for past entries: docs/TECH-DEBT.md §7.3.
 */
const KNOWN_MIRRORS: string[] = []

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

/**
 * The fields a derivation already covers, so they do not count as hand-written. A `Pick<…>` covers
 * only the fields it names, so one Pick cannot launder the hand-written members beside it; any
 * `Tables<…>` or `Omit<…>` in the body covers every field. A field spelled out as its own
 * `name: type` line is not covered.
 */
function derivedFields(decl: Declaration): Set<string> {
  const covered = new Set<string>()
  for (const expr of decl.body.match(/\b(?:Pick|Omit)\s*<[^>]*>|Tables<'[^']+'>/g) ?? []) {
    for (const quoted of expr.match(/'([a-zA-Z_]+)'/g) ?? []) covered.add(quoted.slice(1, -1))
    if (/^Tables</.test(expr) || /^Omit/.test(expr)) return new Set(decl.fields)
  }
  return covered
}

/** Declarations that are a projection of one table, give or take a joined field. */
function mirrors(decls: Declaration[], tables: Map<string, Set<string>>) {
  const out: Array<{ decl: Declaration; table: string }> = []
  for (const decl of decls) {
    const covered = derivedFields(decl)
    const handWritten = decl.fields.filter((f) => !covered.has(f))
    if (handWritten.length < MIN_FIELDS) continue

    for (const [table, columns] of tables) {
      const strangers = handWritten.filter((f) => !columns.has(f))
      const asColumns = handWritten.length - strangers.length
      if (asColumns >= MIN_FIELDS && strangers.length <= MAX_NON_COLUMN_FIELDS) {
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

  it('reads the generated table columns, so a parser that matched nothing cannot pass every check', () => {
    expect(tables.size).toBeGreaterThan(20)
    expect(tables.get('posts')?.size ?? 0).toBeGreaterThan(20)
  })

  it('finds declarations to check', () => {
    expect(decls.length).toBeGreaterThan(100)
  })

  it('has no NEW hand-written mirror of a database row — derive it, or put it in EXEMPT with the reason it is not a projection', () => {
    const allowed = new Set([...Object.keys(EXEMPT), ...KNOWN_MIRRORS])
    const offenders = found
      .filter(({ decl }) => !allowed.has(decl.key))
      .map(
        ({ decl, table }) =>
          `${decl.file}:${decl.line} — ${decl.name} (${decl.fields.length} fields, all columns of "${table}")`
      )

    expect(offenders).toEqual([])
  })

  it('has no stale KNOWN_MIRRORS entry, which would quietly re-permit a mirror already fixed', () => {
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

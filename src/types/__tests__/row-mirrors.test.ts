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
  // `UpdatePostInput` was exempted here while it was a hand-written interface. It is now
  // `z.infer<typeof updatePostSchema>` in lib/validation/post-update-schema.ts, which
  // this scanner does not see at all — a schema declares no field names in a shape it
  // could read. The reason the exemption gave still holds and is recorded there.
  'lib/meta/insights.ts:IGDayTotals':
    'The Graph API\'s day-totals response shape, not a table projection — ig_account_metrics was MODELED ON this API return, so the overlap runs the other way. Its nullability means "Meta served nothing for this range" (the probe\'s silent-empty contract), which the column types cannot express.',
  'features/sources/actions/source-actions.ts:UpdateSourceInput':
    'A write contract, all fields optional so a caller can send only what changed. Same reason as UpdatePostInput.',
  'features/generate/hooks/use-draft-visuals.ts:DraftPostInput':
    "A structural contract deliberately satisfied by BOTH PostData and DraftPost, so it cannot be tied to either. slides_json is `unknown` rather than the column's Json for exactly that reason.",

  // The four below narrow a structurally-untyped `Json` column into the shape the app
  // actually writes. Deriving them would replace a useful assertion with `Json` and
  // push a cast to every use — strictly worse. Same posture as PostData.slides_json.
  'types/sources.ts:ClientSource':
    'Narrows three columns on purpose: `type` to a four-way union, and config/pillar_ids from the column type `Json` to Record<string, unknown> / string[].',
  'lib/queries/db.ts:ClientSourceRow':
    'Same narrowing as ClientSource — config and pillar_ids are `Json` in the column and Record<string, unknown> / string[] here.',
  'lib/queries/db.ts:ClientSourceSummary':
    'Same narrowing as ClientSource — pillar_ids is `Json` in the column and string[] here.',
  'features/dashboard/types.ts:DashboardBriefing':
    'coaching_points is `Json | null` in the column and string[] | null here. (platform_updates genuinely is string[] | null in the column — only the one field is narrowed.)',

  'ai/intelligence/generate-briefing.ts:BriefingResult':
    "Name overlap, not a projection: this is the parsed JSON body of an Anthropic response, and no query returns it. The columns were modeled on the model's output, so the resemblance runs the other way — deriving it would make a prompt contract depend on a table, and would force `?? []` guards at the write for a state the parser cannot produce.",
  'lib/visual/queries.ts:ExtractionPatch':
    'A write contract, not a row: every field but `status` is optional so a status-only "pending" write never references identity/report, and `status` is narrowed to its four literals. Same reason as UpdateSourceInput. (PublishStatusPatch made the same argument until publishing moved to post_publications, where `PublicationPatch` is derived from the row instead — a partial of a derived type, which this scanner is happy with and which cannot drift.)',
}

/**
 * Pre-existing mirrors, from before this guard existed. NOT exemptions — these are
 * debt, and the list may only ever shrink.
 *
 * One left. AgencyInfo declares plan, mode, subscription_status, trial_ends_at and
 * plan_client_limit non-null over columns that permit null, and fetchAgencyById casts
 * to it. Those columns read as populated only because of table defaults — no code path
 * writes any of the four, because billing is not implemented yet. Deriving it now would
 * break `capitalize(agency.plan)` and force a UI decision about a flow that does not
 * exist. Revisit when billing lands; migration 20260813 deliberately left them alone.
 *
 * To clear one: derive it, then delete its line. The staleness check below fails if
 * you derive it and forget. Rationale per entry: docs/TECH-DEBT.md §7.3.
 */
const KNOWN_MIRRORS: string[] = [
  // Everything the 2026-08-31 tightening surfaced has since been derived, so this list holds only
  // AgencyInfo. Keep it as a list rather than deleting it: the guard's value is that a NEW mirror
  // has to be named here on purpose, and an empty array says that more clearly than no array.
  'types/api.ts:AgencyInfo',
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

/**
 * Whether a FIELD is already covered by a derivation, rather than hand-written.
 *
 * Per field, not per declaration. The old version tested the whole body, so one `Pick<PostRow, …>`
 * anywhere inside laundered every hand-written member beside it — which is how ChangeRequestRow's
 * embedded token slipped through while declaring a nullable column non-null.
 *
 * A field is covered when it appears inside a Pick/Omit/Tables expression somewhere in the body;
 * a field spelled out as its own `name: type` line is not.
 */
function derivedFields(decl: Declaration): Set<string> {
  const covered = new Set<string>()
  for (const expr of decl.body.match(/\b(?:Pick|Omit)\s*<[^>]*>|Tables<'[^']+'>/g) ?? []) {
    for (const quoted of expr.match(/'([a-zA-Z_]+)'/g) ?? []) covered.add(quoted.slice(1, -1))
    // `Tables<'posts'>` and `Omit<PostRow, 'x'>` cover everything they do not name.
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

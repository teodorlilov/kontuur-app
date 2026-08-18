#!/usr/bin/env node
/**
 * Reads a `supabase db dump --schema public` file and reports, per table, whether RLS is
 * enabled and how many policies it has.
 *
 * Exists because the raw grep this replaces answers the wrong question. Grepping for
 * `enable row level security` lists the tables that HAVE it; the finding in
 * docs/RLS-SECURITY-REVIEW.md is about the ones that do not, and about the worse middle
 * case — RLS on with **zero policies**, which locks a table to the service role and is
 * how `post_images` and `brand_visual_identity` ended up behind the admin client.
 *
 * Read-only. Takes the dump as input and prints; touches no database.
 *
 * Usage:  npm run db:rls
 *         node scripts/rls-report.mjs [path-to-dump.sql]
 */
import { readFileSync } from 'node:fs'

const dumpPath = process.argv[2] ?? 'supabase/.temp/prod-schema.sql'

let sql
try {
  sql = readFileSync(dumpPath, 'utf8')
} catch {
  console.error(`Cannot read ${dumpPath}.\nRun \`npm run db:link\` once, then \`npm run db:rls\`.`)
  process.exit(1)
}

/** Table names, unquoted, from `CREATE TABLE [IF NOT EXISTS] [public.]"?name"?`. */
const tables = new Set(
  [
    ...sql.matchAll(/create table (?:if not exists )?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi),
  ].map((m) => m[1])
)

/** Tables with RLS switched on. */
const rlsOn = new Set(
  [
    ...sql.matchAll(
      /alter table (?:only )?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"? enable row level security/gi
    ),
  ].map((m) => m[1])
)

/** Policy count per table. */
const policies = new Map()
for (const m of sql.matchAll(/create policy .*? on (?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
  policies.set(m[1], (policies.get(m[1]) ?? 0) + 1)
}

const rows = [...tables].sort().map((table) => {
  const on = rlsOn.has(table)
  const count = policies.get(table) ?? 0
  // The three states that matter, named the way the review doc names them.
  const verdict = !on
    ? 'OPEN — readable via PostgREST by any signed-in user'
    : count === 0
      ? 'LOCKED — RLS on, no policy: service-role only'
      : `SCOPED — ${count} polic${count === 1 ? 'y' : 'ies'}`
  return { table, on, count, verdict }
})

const pad = Math.max(...rows.map((r) => r.table.length), 5)
console.log(`\n${'table'.padEnd(pad)}  rls  policies  verdict`)
console.log(`${'-'.repeat(pad)}  ---  --------  -------`)
for (const r of rows) {
  console.log(
    `${r.table.padEnd(pad)}  ${r.on ? 'on ' : 'OFF'}  ${String(r.count).padStart(8)}  ${r.verdict}`
  )
}

const open = rows.filter((r) => !r.on)
const locked = rows.filter((r) => r.on && r.count === 0)
console.log(
  `\n${rows.length} tables · ${open.length} OPEN · ${locked.length} LOCKED · ${
    rows.length - open.length - locked.length
  } SCOPED`
)

if (open.length > 0) {
  console.log(
    `\nOPEN tables are the finding. The anon key ships in every browser bundle by design and\n` +
      `every signed-in user holds a valid JWT, so PostgREST will serve these rows to a raw\n` +
      `fetch at /rest/v1/<table> for ANY agency. The app is not involved.\n` +
      `  → ${open.map((r) => r.table).join(', ')}\n\n` +
      `Paste this table into docs/RLS-SECURITY-REVIEW.md §"Measured state" and pick a posture.`
  )
}

// Exit 0 either way: this reports, it does not gate. Wiring it into `check` would mean a
// build that fails on a database nobody changed.

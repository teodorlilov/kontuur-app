#!/usr/bin/env node
/**
 * Does a plan describe the code it is about to change, or a guess about it?
 *
 * Two plans on 2026-09-12 needed 17 and 25 review findings of one class: a function called that was
 * private, a reader treated as degrading that throws, a route param that controls nothing, a select
 * string that already existed. Each was a claim about a file nobody had opened. docs/CLAUDE.md §1
 * now requires every plan to carry a "Verified before writing" table — symbol, file:line, exported
 * or not, throws or degrades, cache — filled from reads. This makes the table's checkable claims
 * mechanical, so a plan cannot reach the reviewer with a row that reality contradicts.
 *
 *   npm run plan:check -- <plan.md>    exit 1 on any claim the code contradicts
 *
 * WHAT IT CHECKS
 *   - Every file the plan cites — a backticked token with a directory or a `:line`, such as
 *     `src/lib/queries/cache.ts:208` or `compute/format.ts` — exists, unless the same line marks it
 *     `(new)`. A shorthand resolves only while exactly one file ends with it; a bare `page.tsx`
 *     with no directory and no line is a mention, not a citation, and is left alone.
 *   - In the table: each backticked identifier in the Symbol column appears in each cited file;
 *     "yes" in the Exported column means an `export` declaration or export list names it, and
 *     "private"/"no" means none does; a cited line number sits within 40 lines of a line that names
 *     the symbol, so a row copied from an old survey of a file that has since moved is flagged.
 *
 * WHAT IT CANNOT SEE. None of these may be treated as covered:
 *   - Whether a function THROWS or degrades, what a cache key or tag is, what a param does. Those
 *     columns are prose; only reading fills them honestly. The check proves the table was written
 *     against real files and real export status — it can never prove the reading was careful.
 *   - Re-exports through an index, or a symbol exported under another name.
 *   - Claims outside the table and outside backticked paths.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LINE_DRIFT = 40
const SEARCH_ROOTS = ['src', 'docs', 'scripts', 'supabase']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '.temp') walk(full, out)
    } else out.push(relative(ROOT, full))
  }
  return out
}

/** Every file a plan may cite, so a shorthand path can be resolved by its unique suffix. */
const ALL_FILES = SEARCH_ROOTS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) =>
  walk(join(ROOT, d))
)

const planPath = process.argv[2]
if (!planPath) {
  console.error('usage: npm run plan:check -- <plan.md>')
  process.exit(2)
}
const plan = readFileSync(resolve(planPath), 'utf8')
const planLines = plan.split('\n')

/**
 * A cited file: a backticked token with a source-file extension that also carries a directory or a
 * `:line`. A bare `page.tsx` in a sentence is a mention and is left alone; `report-data.ts:186` or
 * `compute/format.ts` is a citation and must resolve to exactly one file.
 */
const PATH_TOKEN =
  /`([\w.()\[\]-]+(?:\/[\w.()\[\]-]+)*\.(?:tsx?|mjs|js|sql|md|json))((?::\d+(?:-\d+)?)?)`/g
const isCitation = (token, lines) => token.includes('/') || lines.length > 0
const NEW_MARK = /\(new\b|\bnew;|\bnew\)/i

/**
 * Resolves a cited path. A full repo-relative path wins; otherwise a shorthand (`cache.ts`,
 * `compute/format.ts`) resolves only when exactly one file ends with it — `report-data.ts` names
 * two files, and a plan that does not say which is making the guess this check exists to catch.
 */
function resolvePath(cited) {
  for (const candidate of [cited, `src/${cited}`]) {
    if (existsSync(join(ROOT, candidate))) return { full: join(ROOT, candidate), shown: candidate }
  }
  const matches = ALL_FILES.filter((f) => f.endsWith(`/${cited}`))
  if (matches.length === 1) return { full: join(ROOT, matches[0]), shown: matches[0] }
  if (matches.length > 1) return { ambiguous: matches }
  return null
}

const failures = []
let pathsChecked = 0

// ── 1. cited paths exist ─────────────────────────────────────────────────────
planLines.forEach((line, index) => {
  if (NEW_MARK.test(line)) return
  for (const match of line.matchAll(PATH_TOKEN)) {
    if (!isCitation(match[1], match[2])) continue
    pathsChecked += 1
    const found = resolvePath(match[1])
    if (!found) failures.push(`plan line ${index + 1}: cited path does not exist — ${match[1]}`)
    else if (found.ambiguous)
      failures.push(
        `plan line ${index + 1}: ${match[1]} names ${found.ambiguous.length} files (${found.ambiguous.join(', ')}) — say which`
      )
  }
})

// ── 2. the verified table ────────────────────────────────────────────────────
const tableStart = planLines.findIndex((l) => /^##\s+Verified before writing/i.test(l))
if (tableStart === -1) {
  failures.push('the plan has no "## Verified before writing" table (docs/CLAUDE.md §1)')
}

const IDENT = /`([A-Za-z_$][\w$]*)`/g
const WHERE = /([\w./()\[\]-]+\.\w+)((?::[\d,\s-]+)?)/g

/** Does `file` export `name` — as a declaration, or in an export list? */
function isExported(source, name) {
  const decl = new RegExp(
    `^\\s*export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class|interface|type|enum)\\s+${name}\\b`,
    'm'
  )
  const list = new RegExp(`^\\s*export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`, 'm')
  return decl.test(source) || list.test(source)
}

/** Whether any line naming `name` sits within LINE_DRIFT of one of the cited lines. */
function nearCitedLine(source, name, cited) {
  const lines = source.split('\n')
  const hits = []
  lines.forEach((l, i) => {
    if (new RegExp(`\\b${name}\\b`).test(l)) hits.push(i + 1)
  })
  if (hits.length === 0) return false
  return cited.some((n) => hits.some((h) => Math.abs(h - n) <= LINE_DRIFT))
}

let rowsChecked = 0
if (tableStart !== -1) {
  for (let i = tableStart + 1; i < planLines.length; i += 1) {
    const line = planLines[i]
    if (/^##\s/.test(line)) break
    if (!line.startsWith('|') || /^\|\s*-+/.test(line) || /^\|\s*Symbol/i.test(line)) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length < 3) continue
    const [symbolCell, whereCell, exportedCell] = cells
    const symbols = [...symbolCell.matchAll(IDENT)].map((m) => m[1])
    if (symbols.length === 0) continue
    if (/\*/.test(whereCell)) continue
    rowsChecked += 1
    const label = `plan line ${i + 1} (${symbols.join(', ')})`

    const places = [...whereCell.replaceAll('`', '').matchAll(WHERE)].map((m) => ({
      cited: m[1],
      lines: (m[2] ?? '')
        .split(/[:,\s]+/)
        .flatMap((part) => (part.includes('-') ? part.split('-') : [part]))
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    }))
    if (places.length === 0) {
      failures.push(`${label}: the Where column names no file`)
      continue
    }

    const expectExported = exportedCell
      .replaceAll('*', '')
      .toLowerCase()
      .split(/[/,]/)
      .map((flag) => flag.trim())
      .map((flag) =>
        /^(yes|exported|true)/.test(flag)
          ? true
          : /private|^no\b|not exported/.test(flag)
            ? false
            : null
      )

    const resolved = places.map((place) => ({ place, found: resolvePath(place.cited) }))
    for (const { place, found } of resolved) {
      if (!found) failures.push(`${label}: Where names a missing file — ${place.cited}`)
      else if (found.ambiguous)
        failures.push(
          `${label}: ${place.cited} names ${found.ambiguous.length} files (${found.ambiguous.join(', ')}) — say which`
        )
    }
    const sources = resolved
      .filter(({ found }) => found && !found.ambiguous)
      .map(({ place, found }) => ({ place, found, source: readFileSync(found.full, 'utf8') }))

    symbols.forEach((name, n) => {
      const word = new RegExp(`\\b${name}\\b`)
      const homes = sources.filter(({ source }) => word.test(source))
      if (homes.length === 0) {
        if (sources.length > 0)
          failures.push(
            `${label}: ${name} does not appear in ${sources.map((s) => s.found.shown).join(' or ')}`
          )
        return
      }
      const expected = expectExported[n] ?? expectExported[0] ?? null
      for (const { place, found, source } of homes) {
        if (expected !== null && isExported(source, name) !== expected) {
          failures.push(
            `${label}: ${name} is ${isExported(source, name) ? 'exported' : 'NOT exported'} in ${found.shown}, the table says ${expected ? 'exported' : 'private'}`
          )
        }
        if (place.lines.length > 0 && !nearCitedLine(source, name, place.lines)) {
          failures.push(
            `${label}: ${name} is not within ${LINE_DRIFT} lines of ${found.shown}:${place.lines.join(',')} — the row was written against an older file`
          )
        }
      }
    })
  }
}

console.log(`${pathsChecked} cited paths, ${rowsChecked} verified rows checked.`)
if (failures.length > 0) {
  console.error('\nThe plan makes claims the code contradicts. Open the file and fix the row:\n')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('Every cited path exists and every table row matches the code.')

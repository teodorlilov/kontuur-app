#!/usr/bin/env node
/**
 * Where does a module's centre of gravity actually sit?
 *
 * A file under `src/features/X` is claimed by X. When most of its importers live outside X — and
 * especially when nothing inside X imports it at all — the folder name has stopped describing the
 * code and started misdirecting whoever reads the tree. That is not a tidiness complaint: it is the
 * single habit that produced the most findings in the 2026-08-30 traceability audit, because it
 * happens silently. A module is written where its first caller needed it, the second and third
 * callers arrive from elsewhere, and nothing ever revisits the filing.
 *
 * The check exists because no other gate can see this. `tsc` is happy, `eslint` is happy, `knip`
 * only asks whether an export is used at all. Placement is the one dimension of this codebase with
 * no feedback signal, which is why it drifted furthest.
 *
 *   node scripts/module-ownership.mjs           report every feature module and its importers
 *   node scripts/module-ownership.mjs --check   exit 1 on a violation (for `npm run check`)
 *
 * Deliberately regex-based rather than the TypeScript compiler API: this answers "which file names
 * which other file", which is a lexical question, and a 90-line script nobody has to maintain a
 * program-graph for is more likely to survive than a correct one that nobody understands.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH
 *
 * "This whole folder is misnamed" — `features/publishing/lib/storage.ts`, the audit's worst
 * offender, does not appear below. Its importers are overwhelmingly API routes, and a route
 * importing a feature is the normal direction; the reason it is nonetheless misfiled is that those
 * routes belong to canvas assets and Canva exports rather than to Meta publishing, which is a
 * judgement about what the routes are FOR. No lexical rule decides that, and tuning thresholds until
 * this one case appeared would have meant overfitting to a list I already had, at the price of false
 * alarms on everything else.
 *
 * So the scope is one unambiguous, mechanically decidable smell: a module inside `features/X` that
 * NO file in `features/X` imports, pulled by two or more peer features or shared layers. That is the
 * "second caller" rule with teeth. A check with no false positives gets trusted and acted on; one
 * that cries wolf gets an ignore rule and then gets ignored.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

/**
 * Not every outside importer is a smell, and the first cut of this check got that wrong.
 *
 * `src/app/**` consuming a feature is the architecture working: pages and routes are exactly who a
 * feature exists for, and counting them flagged `features/marketing/components/footer.tsx` for being
 * imported by the marketing pages. What actually indicates misfiling is a PEER FEATURE reaching in,
 * or a shared layer (`lib/`, `components/`, `utils/`) importing downward into a feature, which is
 * backwards regardless.
 */
const SHARED_ROOTS = ['lib', 'components', 'utils', 'types', 'ai', 'hooks']

/** Claimed by another feature or by a shared layer: this many, with none inside, is misfiled. */
const ORPHAN_MIN_FOREIGN = 2
/** Still used at home, but pulled harder from elsewhere. */
const DRIFT_MIN_FOREIGN = 3

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Static `from '...'`, bare `import '...'`, and dynamic `import('...')` alike. */
const SPECIFIER = /(?:from\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

/** A specifier resolved to a repo file, or null for packages and unresolvable paths. */
function resolveSpecifier(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** The feature a file belongs to, or null for app/, lib/, components/, types/, utils/, ai/. */
function featureOf(file) {
  const rel = relative(SRC, file)
  const match = rel.match(/^features[/\\]([^/\\]+)[/\\]/)
  return match ? match[1] : null
}

const isTest = (file) => /__tests__|\.test\.tsx?$/.test(file)

const files = walk(SRC)
/** importee -> Set of importer files. Tests excluded: a test importing a module says nothing about
 *  which feature owns it, and counting them would let a co-located test mask an orphan. */
const importers = new Map()

for (const file of files) {
  if (isTest(file)) continue
  const source = readFileSync(file, 'utf8')
  for (const [, spec] of source.matchAll(SPECIFIER)) {
    const target = resolveSpecifier(spec, file)
    if (!target || target === file) continue
    if (!importers.has(target)) importers.set(target, new Set())
    importers.get(target).add(file)
  }
}

/** True for a shared layer reaching down into a feature — backwards whichever feature it is. */
function isSharedLayer(file) {
  const top = relative(SRC, file).split(/[/\\]/)[0]
  return SHARED_ROOTS.includes(top)
}

const allowPath = join(import.meta.dirname, 'module-ownership-allow.json')
/**
 * Modules deliberately shared, each with a reason.
 *
 * The point is not to silence the check — it is to make every exception a line somebody wrote on
 * purpose and a reviewer can see in a diff. A feature's genuine public entry point belongs here; a
 * helper that drifted does not, it belongs somewhere else.
 */
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : {}

const rows = []
for (const file of files) {
  if (isTest(file)) continue
  const owner = featureOf(file)
  if (!owner) continue
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  if (rel in allow) continue

  const seen = [...(importers.get(file) ?? new Set())]
  const inside = seen.filter((f) => featureOf(f) === owner)
  // Peer features and shared layers only. `src/app/**` is a feature's intended consumer.
  const foreign = seen.filter((f) => {
    const from = featureOf(f)
    return (from !== null && from !== owner) || isSharedLayer(f)
  })
  if (foreign.length === 0) continue

  const verdict =
    inside.length === 0 && foreign.length >= ORPHAN_MIN_FOREIGN
      ? 'orphan'
      : foreign.length >= DRIFT_MIN_FOREIGN && foreign.length > inside.length
        ? 'drift'
        : null
  if (verdict) rows.push({ file: rel, owner, inside, outside: foreign, verdict })
}

rows.sort((a, b) => b.outside.length - a.outside.length)

const orphans = rows.filter((r) => r.verdict === 'orphan')
const drifting = rows.filter((r) => r.verdict === 'drift')

for (const row of rows) {
  const tag = row.verdict === 'orphan' ? 'ORPHAN' : 'DRIFT '
  console.log(
    `${tag} ${row.file}\n        owned by features/${row.owner} — ${row.outside.length} foreign importer(s), ${row.inside.length} inside`
  )
  for (const importer of row.outside.slice(0, 4))
    console.log(`          <- ${relative(ROOT, importer)}`)
  if (row.outside.length > 4) console.log(`          <- …and ${row.outside.length - 4} more`)
}

console.log(
  `\n${orphans.length} orphaned (no importer inside their own feature), ${drifting.length} drifting.`
)

if (process.argv.includes('--check') && orphans.length > 0) {
  console.error(
    '\nA module nothing in its own feature imports does not belong to that feature.\n' +
      'Move it to src/lib/, to the feature that actually uses it, or to a feature of its own.'
  )
  process.exit(1)
}

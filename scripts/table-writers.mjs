#!/usr/bin/env node
/**
 * Which files are allowed to WRITE each table.
 *
 * The 2026-08-31 column audit found ten product operations with two to five implementations each —
 * `scheduled_at` written by a validated action and by a server action that accepted any string,
 * both reachable from the same screen; five notification inserts, four bypassing the dedup; account
 * provisioning running twice and racing itself. Every one was locally reasonable the day it was
 * added, and nothing anywhere said a writer already existed.
 *
 * This does not decide whether a second writer is right. It makes adding one a line somebody writes
 * on purpose, with a reason, that a reviewer sees in the diff.
 *
 *   npm run writers             list every table and who writes it
 *   npm run writers -- --check  exit 1 when the writer set has grown, or when an entry has gone stale
 *
 * KEYED ON `.from('table')`, NEVER ON COLUMN NAMES. This is the whole design, and it is not
 * theoretical: eight real writers in this codebase pass a pre-built variable — `draftColumns(post)`,
 * `discardRow`, `fields`, `updates`, `tokenRows`, `patch`, `row` — and a column-name search at the
 * call site returns nothing for any of them. I made exactly that mistake twice while auditing this,
 * once reporting twelve writers of a column that has four, and once three.
 *
 * WHAT IT CANNOT SEE. None of these may be treated as covered:
 *   - It counts FILES, not operations. publish-post.ts legitimately writes `posts` from claimPost,
 *     markPublished and markFailed; a fourth duplicate added to that same file is invisible.
 *   - It cannot resolve a computed table name. `purgeAccountAnalytics` deletes from four tables
 *     through a `scoped(table)` helper and the scan finds one of them; the other three are
 *     `[hand-listed]` in the JSON, because a silent skip would have let the registry read as
 *     complete when it was not.
 *   - It never sees writes that do not go through PostgREST: the `posts_stamp_edited_at` trigger
 *     writes `edited_at`, the image-credit RPCs write `image_generation_usage`, and the clients
 *     cascade deletes rows in six tables.
 *   - It says nothing about whether a write is VALIDATED. It would have passed batchSchedulePosts
 *     writing any string into scheduled_at, and updateSource writing an unchecked URL.
 *   - Storage writes (`supabase.storage.from`) are a different API and out of scope.
 *
 * Because of the first and fourth, the allowlist reasons are the point. The check proves the writer
 * set did not GROW; it can never prove the writers agree.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const REGISTRY = join(import.meta.dirname, 'table-writers.json')

/** A PostgREST write. `.delete()` takes no argument, hence the separate alternative. */
const WRITE = /\.(insert|update|upsert)\s*\(|\.delete\s*\(\s*\)/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') walk(full, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Tables this file writes.
 *
 * Scoped to the CHAIN, not the file. The first version asked only whether a file contained a write
 * anywhere and named the table anywhere, which credited every file that merely reads one table
 * while writing another — `social_connections` came back with twelve writers, most of which only
 * look it up. A registry that lists ten innocent files is a registry nobody reads.
 *
 * So each `.from('x')` is examined against the span that follows it, up to the next `.from(` or a
 * blank line, which is where a Supabase chain ends in this codebase. That covers the multi-line
 * form (`await supabase\n.from('posts')\n.update({…})`) and excludes a read chain sitting beside
 * an unrelated write.
 */
function writesIn(source) {
  const tables = new Set()
  for (const match of source.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
    const after = source.slice(match.index + match[0].length)
    const nextFrom = after.search(/\.from\(\s*'/)
    const blankLine = after.search(/\n[ \t]*\n/)
    const ends = [nextFrom, blankLine].filter((i) => i >= 0)
    const chain = after.slice(0, ends.length > 0 ? Math.min(...ends) : after.length)
    if (WRITE.test(chain)) tables.add(match[1])
  }
  return [...tables]
}

const registry = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : {}
const found = new Map()

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  for (const table of writesIn(readFileSync(file, 'utf8'))) {
    if (!found.has(table)) found.set(table, new Set())
    found.get(table).add(rel)
  }
}

/**
 * A writer the scan cannot see, carrying its reason like any other entry.
 *
 * Only `purgeAccountAnalytics` needs this today: it deletes from four tables through a `scoped(table)`
 * helper, so `.from(table)` never names one and three of the four would go unlisted. Silently
 * skipping the file would have been the worse failure — the registry would have read as complete.
 */
const HAND_LISTED = '[hand-listed]'

const list = !process.argv.includes('--check')
const unlisted = []
for (const [table, files] of [...found].sort()) {
  const allowed = registry[table] ?? {}
  const news = [...files].filter((f) => !(f in allowed)).sort()
  if (news.length > 0) unlisted.push({ table, files: news })
  if (list) {
    const hand = Object.keys(allowed).filter((f) => !files.has(f))
    console.log(`${table}  (${files.size + hand.length})`)
    for (const f of [...files].sort()) console.log(`    ${f in allowed ? ' ' : '+'} ${f}`)
    for (const f of hand.sort()) console.log(`    · ${f}`)
  }
}

// A listed file that no longer writes the table. Left alone it silently re-blesses that file if a
// write ever comes back, which is the allowlist quietly widening on its own.
const stale = []
for (const [table, allowed] of Object.entries(registry)) {
  for (const [file, reason] of Object.entries(allowed)) {
    if (found.get(table)?.has(file)) continue
    if (typeof reason === 'string' && reason.startsWith(HAND_LISTED)) continue
    stale.push(`${table} → ${file}`)
  }
}

const total = [...found.values()].reduce((n, s) => n + s.size, 0)
console.log(
  `\n${found.size} tables written from ${total} files; ` +
    `${unlisted.length} with a new writer, ${stale.length} stale entries.`
)

if (list) process.exit(0)

if (unlisted.length > 0) {
  console.error('\nA table gained a writer that is not in scripts/table-writers.json.')
  console.error('Before adding it, check whether an existing writer already means the same thing —')
  console.error(
    '"it needed a different cache tag" is a reason to pass an option, not to fork the write.\n'
  )
  for (const { table, files } of unlisted) {
    console.error(`  ${table}`)
    for (const f of files) console.error(`    + ${f}`)
  }
}

if (stale.length > 0) {
  console.error('\nThese files no longer write their table. Delete the entry:\n')
  for (const entry of stale) console.error(`  - ${entry}`)
}

if (unlisted.length > 0 || stale.length > 0) process.exit(1)

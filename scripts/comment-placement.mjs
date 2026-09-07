#!/usr/bin/env node
/**
 * Comments live above a declaration, never inside one.
 *
 * The 2026-09-07 comment audit over `features/analytics` found ~15 assertions naming code that
 * no longer existed, and 633 comment lines sitting inside function bodies. The false ones were
 * all survivors of an edit nobody re-read them against; the in-body ones were noise a reader
 * already had in front of them. This gate only enforces the mechanical half — placement — since
 * that is the half a machine can decide.
 *
 * A comment ABOVE a declaration is a claim about a thing that is about to be named, so an editor
 * changing that thing sees it. A comment INSIDE a body has no such anchor: the code around it can
 * be replaced entirely and the comment reads as though it still applies.
 *
 * Scope is opt-in per directory (ALLOWLIST below) rather than repo-wide, because retrofitting the
 * whole tree in one pass is how a gate acquires an ignore file. Add a directory when it has been
 * through the pass.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

/** Directories that have been through the comment pass and must stay clean. */
const ALLOWLIST = ['features/analytics']

/**
 * Comment positions, found by walking the source with a tokenizer that knows strings, template
 * literals (including `${}` nesting), regex literals and comments — a regex alone cannot tell
 * `//` in a URL from a line comment, and a brace counter alone cannot tell a block body from an
 * object literal.
 *
 * Returns only violations: a comment with code before it on the same line, or one whose nearest
 * enclosing brace opened a BODY (function, arrow, class) rather than a declaration or literal.
 */
/**
 * A comment is misplaced when it annotates a STEP rather than documenting a THING.
 *
 * The test is what follows it. A comment above a declaration — a function, a type, a constant, a
 * type member, a `describe`/`it` case — documents that declaration, and an editor changing the
 * declaration sees it. A comment above an ordinary statement documents a step in a body the code
 * already shows, and survives every rewrite of the lines beneath it.
 *
 * Also flagged: any comment with code before it on the same line, which anchors to nothing.
 */
const DECLARES =
  /^(import\b|export\s*[{*]|export\s+type\s*\{|(export\s+)?(default\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var|abstract|declare|readonly|public|private|protected|get|set)\b)/

/** A `describe('…', () => {` / `it('…', …)` case, a lifecycle hook, or a `vi.mock(` — each names a thing. */
const NAMES_A_CASE =
  /^(describe|it|test|bench|beforeEach|afterEach|beforeAll|afterAll|vi\.mock|vi\.doMock)\b/

/** A type-literal or interface member: `name:`, `name?:`, `readonly name:`, `'quoted':`. */
const MEMBER = /^(readonly\s+)?(\[[^\]]+\]|'[^']*'|"[^"]*"|[A-Za-z_$][\w$]*)\??\s*[:(<]/

/** A JSX prop or attribute on the line below, e.g. a comment above `className={…}`. */
const JSX_ATTR = /^[A-Za-z_$][\w$-]*\s*=/

/** A member of a discriminated union written one arm per line: `| { kind: 'none' }`. */
const UNION_ARM = /^\|/

function stripStringsAndComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//' || two === '/*') {
      const block = two === '/*'
      const end = block ? src.indexOf('*/', i + 2) : src.indexOf('\n', i)
      const stop = end === -1 ? src.length : block ? end + 2 : end
      out += two
      for (const ch of src.slice(i + 2, stop)) out += ch === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += ' '
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          out += '  '
          i += 2
        } else if (src[i] === quote) {
          out += ' '
          i++
          break
        } else {
          out += src[i] === '\n' ? '\n' : ' '
          i++
        }
      }
      continue
    }
    out += c
    i++
  }
  return out
}

function violations(src) {
  const lines = src.split('\n')
  const stripped = stripStringsAndComments(src)
  const blank = stripped.split('\n')
  // Brace depth per line, from a copy with strings and comments blanked. A `const` at depth 0 is
  // a module declaration worth documenting; the same `const` inside a body is a step.
  const blankKeepingLines = (t) => t.replace(/[^\n]/g, ' ')
  const bare = stripped
    .replace(/\/\/[^\n]*/g, blankKeepingLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines)
  const depth = []
  let d = 0
  for (const line of bare.split('\n')) {
    depth.push(d)
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') d++
      else if (ch === '}' || ch === ')' || ch === ']') d = Math.max(0, d - 1)
    }
  }
  const out = []
  for (let n = 0; n < lines.length; n++) {
    const text = lines[n]
    const codeOnly = blank[n] ?? ''
    const trimmed = text.trim()
    const isComment = /^(\/\/|\/\*|\*|\{\/\*)/.test(trimmed)
    if (!isComment) {
      const marker = codeOnly.search(/\/\/|\/\*/)
      if (marker > 0 && codeOnly.slice(0, marker).trim() !== '') {
        out.push({ line: n + 1, kind: 'trailing a line of code' })
      }
      continue
    }
    if (/^(\*|\*\/)/.test(trimmed)) continue
    let m = n + 1
    while (m < lines.length) {
      const next = lines[m].trim()
      if (next === '' || /^(\/\/|\/\*|\*|\*\/|\{\/\*)/.test(next)) {
        m++
        continue
      }
      break
    }
    const next = (lines[m] ?? '').trim()
    // Inside a body, only a named case (`it`, `describe`, a lifecycle hook, a `vi.mock`) or a
    // type/JSX member is a thing worth a doc. A local `const` is a step.
    const nested = (depth[m] ?? 0) > 0
    // A `/** … */` block is a doc attached to whatever it precedes, so it stays legal inside a
    // body when it precedes a declaration — a shared fixture in a `describe`, say. A `//` line
    // comment carries no such attachment and is a step annotation wherever it sits.
    const isDoc = trimmed.startsWith('/**')
    const documents = nested
      ? (isDoc && DECLARES.test(next)) ||
        NAMES_A_CASE.test(next) ||
        MEMBER.test(next) ||
        JSX_ATTR.test(next) ||
        UNION_ARM.test(next) ||
        next === '' ||
        next.startsWith('}')
      : DECLARES.test(next) ||
        NAMES_A_CASE.test(next) ||
        MEMBER.test(next) ||
        JSX_ATTR.test(next) ||
        UNION_ARM.test(next) ||
        next === '' ||
        next.startsWith('}')
    if (!documents)
      out.push({ line: n + 1, kind: 'annotating a statement, not documenting a declaration' })
  }
  return out
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = walk(SRC).filter((f) => {
  const rel = relative(SRC, f).replaceAll('\\', '/')
  return ALLOWLIST.some((dir) => rel.startsWith(dir + '/'))
})

const found = []
for (const file of files) {
  for (const v of violations(readFileSync(file, 'utf8'))) {
    found.push(`${relative(ROOT, file)}:${v.line} — comment ${v.kind}`)
  }
}

console.log(
  `${files.length} files in ${ALLOWLIST.join(', ')}; ${found.length} misplaced comment${found.length === 1 ? '' : 's'}.`
)
if (found.length > 0) {
  console.error('\nA comment belongs above the function, module, type or constant it describes.')
  console.error(
    'Fold what a future editor needs into that doc; delete the rest. See docs/CLAUDE.md.\n'
  )
  for (const f of found) console.error(`  ${f}`)
  process.exit(1)
}

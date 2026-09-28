#!/usr/bin/env node
/**
 * `npm run comments`: a comment lives above a declaration, never inside a function body.
 *
 * A comment above a declaration is a claim about the thing about to be named, so an editor
 * changing that thing sees it. A comment inside a body has no such anchor: the code around it can
 * be replaced entirely and the comment still reads as though it applies. This gate decides
 * placement only; whether a doc is true is review's job (docs/CLAUDE.md, "Comments").
 *
 * Files are parsed with the TypeScript compiler rather than scanned with regexes: whether a line
 * sits in a function body or in an object literal passed to a call is a syntactic question, and a
 * brace counter answers it wrong for every call that takes an object.
 *
 * Scope is opt-in per directory (ALLOWLIST), because retrofitting the whole tree in one pass is
 * how a gate acquires an ignore file. Add a directory once it has been through the pass.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const { SyntaxKind } = ts

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

/** Directories that have been through the comment pass and must stay clean. */
const ALLOWLIST = [
  'features/analytics',
  'features/settings',
  'lib/billing',
  'lib/generation',
  'lib/notifications',
  'lib/email',
  'lib/render',
  'app/api/billing',
  'app/api/cron',
  'app/api/ai',
]

/** A `describe('…', () => {` / `it('…', …)` case, a lifecycle hook, or a `vi.mock(` — each names a thing. */
const NAMES_A_CASE =
  /^(describe|it|test|bench|beforeEach|afterEach|beforeAll|afterAll|vi\.mock|vi\.doMock)\b/

/** Statements that name a thing, so a comment above one is its doc. */
const DECLARATIONS = new Set([
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ImportEqualsDeclaration,
  SyntaxKind.ExportDeclaration,
  SyntaxKind.ExportAssignment,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.VariableStatement,
])

/**
 * What else a comment outside every function body may precede: a member of an interface, type
 * literal, class, object literal or enum; a parameter; an arm of a union written one per line; or
 * the end of a block or the file.
 */
const OUTSIDE_A_BODY = new Set([
  SyntaxKind.PropertySignature,
  SyntaxKind.MethodSignature,
  SyntaxKind.IndexSignature,
  SyntaxKind.CallSignature,
  SyntaxKind.ConstructSignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.ClassStaticBlockDeclaration,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.EnumMember,
  SyntaxKind.Parameter,
  SyntaxKind.UnionType,
  SyntaxKind.BarToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.EndOfFileToken,
])

/** JSDoc nodes sit in trivia; their children's positions point inside comment text. */
function isJsDoc(node) {
  return node.kind >= SyntaxKind.FirstJSDocNode && node.kind <= SyntaxKind.LastJSDocNode
}

/**
 * Every comment in the file, in source order. Collected from each token's leading and trailing
 * trivia, so a `//` in a string, template, regex or JSX text never counts; ranges that start inside
 * JSX text are dropped because the trivia scanner reads that text as code.
 */
function commentRanges(sf) {
  const found = new Map()
  const jsxText = []
  const visit = (node) => {
    if (isJsDoc(node)) return
    if (node.kind === SyntaxKind.JsxText) {
      jsxText.push(node)
      return
    }
    for (const range of ts.getLeadingCommentRanges(sf.text, node.pos) ?? [])
      found.set(range.pos, range)
    for (const range of ts.getTrailingCommentRanges(sf.text, node.end) ?? [])
      found.set(range.pos, range)
    for (const child of node.getChildren(sf)) visit(child)
  }
  visit(sf)
  return [...found.values()]
    .filter((range) => !jsxText.some((text) => range.pos >= text.pos && range.pos < text.end))
    .sort((a, b) => a.pos - b.pos)
}

/**
 * The node a comment ending at `pos` precedes: the outermost node that starts at the first token
 * after it. For a comment above `x = 1` that is the statement; above `onProgress:` in a call's
 * argument object, the property.
 */
function nodeAfter(sf, pos) {
  let node = sf
  for (;;) {
    const child = node.getChildren(sf).find((c) => c.end > pos && c.pos < c.end && !isJsDoc(c))
    if (!child) break
    node = child
    if (child.getChildCount(sf) === 0) break
  }
  if (node === sf) return sf.endOfFileToken
  const start = node.getStart(sf)
  while (node.parent && node.parent !== sf && node.parent.getStart(sf) === start) node = node.parent
  return node
}

/** The innermost function (or class static block) whose body holds `node`, or null. */
function enclosingFunction(node) {
  for (let child = node; child.parent; child = child.parent) {
    const parent = child.parent
    const hasBody = ts.isFunctionLike(parent) || ts.isClassStaticBlockDeclaration(parent)
    if (hasBody && parent.body === child) return parent
  }
  return null
}

/** Whether `node` is a statement that calls `describe`, `it`, a lifecycle hook or `vi.mock`. */
function namesACase(sf, node) {
  return ts.isExpressionStatement(node) && NAMES_A_CASE.test(node.getText(sf))
}

/**
 * Whether a comment documents what follows it rather than annotating a step. Nothing inside a
 * function body passes — a `describe` callback's cases included, since a test's `it(…)` title is
 * its explanation (docs/CLAUDE.md, "Comments").
 */
function isPlaced(sf, range) {
  const next = nodeAfter(sf, range.end)
  if (enclosingFunction(next)) return false
  return DECLARATIONS.has(next.kind) || OUTSIDE_A_BODY.has(next.kind) || namesACase(sf, next)
}

/**
 * The misplaced comments in `src`, as `{ line, kind }`: one with code before it on its line (the
 * `{` of a JSX `{/* … *\/}` does not count as code), or one that annotates a step instead of
 * documenting a declaration. `fileName` picks the dialect, so pass a `.tsx` name for source with
 * JSX.
 */
export function violations(src, fileName = 'source.ts') {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true)
  const out = []
  for (const range of commentRanges(sf)) {
    const line = sf.getLineAndCharacterOfPosition(range.pos).line + 1
    const before = src.slice(src.lastIndexOf('\n', range.pos - 1) + 1, range.pos).trim()
    if (before !== '' && before !== '{') out.push({ line, kind: 'trailing a line of code' })
    else if (!isPlaced(sf, range))
      out.push({ line, kind: 'annotating a statement, not documenting a declaration' })
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

/** Check every file under the allowlisted directories — only when run, never when imported. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = walk(SRC).filter((f) => {
    const rel = relative(SRC, f).replaceAll('\\', '/')
    return ALLOWLIST.some((dir) => rel.startsWith(dir + '/'))
  })

  const found = []
  for (const file of files) {
    for (const v of violations(readFileSync(file, 'utf8'), file)) {
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
}

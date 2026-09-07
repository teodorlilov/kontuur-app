import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * A component's folder still describes the component.
 *
 * `components/` is split on two axes: which network a thing belongs to, then what it is. The
 * network axis is the one that rots, because it is a claim about the import graph rather than
 * about the file — and the graph moves under it. `posts-table.tsx` sat with the shared
 * components for a commit after `posts-table-shared` was extracted out of it, because nothing
 * noticed it had stopped being shared. Nothing would have noticed the reverse either: a file in
 * `instagram/` that a Facebook section quietly started rendering is a network label that is
 * simply false, and every gate in `npm run check` is blind to it.
 *
 * So the rule is derived, not declared. Reachability from the two document roots decides the
 * folder, and the folder has to agree:
 *
 *   instagram/  reachable from the Instagram document only
 *   facebook/   reachable from the Facebook document only
 *   chrome/     reachable from NEITHER — the page renders it, and print leaves it home
 *   everything else (document/, charts/, table/, filling/)  reachable from BOTH
 *
 * The role axis is deliberately NOT checked. Which of document/, charts/, table/ or filling/ a
 * shared component belongs to is a judgment about what the thing is, and a test that guessed at
 * it would be asserting taste.
 */

const COMPONENTS = path.resolve(__dirname, '../components')
const IG_ROOT = 'instagram/analytics-view.tsx'
const FB_ROOT = 'facebook/facebook-analytics-view.tsx'
/** Rendered by the page, not by either document. */
const CHROME = 'chrome'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.tsx')) out.push(path.relative(COMPONENTS, full))
  }
  return out
}

/** Static `from '...'` and dynamic `import('...')` alike, resolved to component-relative paths. */
function importsOf(file: string): string[] {
  const body = readFileSync(path.join(COMPONENTS, file), 'utf8')
  const out: string[] = []
  for (const [, spec] of body.matchAll(/(?:from\s+|import\s*\(\s*)'(\.[^']+)'/g)) {
    const resolved = path.normalize(path.join(path.dirname(file), spec!))
    if (existsSync(path.join(COMPONENTS, `${resolved}.tsx`))) out.push(`${resolved}.tsx`)
  }
  return out
}

function reachableFrom(root: string, graph: Map<string, string[]>): Set<string> {
  const seen = new Set([root])
  const stack = [root]
  while (stack.length > 0) {
    for (const next of graph.get(stack.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return seen
}

const files = walk(COMPONENTS)
const graph = new Map(files.map((file) => [file, importsOf(file)]))
const fromInstagram = reachableFrom(IG_ROOT, graph)
const fromFacebook = reachableFrom(FB_ROOT, graph)

/** What the import graph says this file's folder should be. */
function expectedFolder(file: string): string {
  const ig = fromInstagram.has(file)
  const fb = fromFacebook.has(file)
  if (ig && fb) return 'a shared folder (document/, charts/, table/ or filling/)'
  if (ig) return 'instagram/'
  if (fb) return 'facebook/'
  return `${CHROME}/`
}

function actualFolder(file: string): string {
  const dir = path.dirname(file)
  return dir === '.' ? '(the components root)' : `${dir}/`
}

describe('component placement follows the import graph', () => {
  it('finds both document roots and a real graph', () => {
    // A walk that matched nothing would make every assertion below vacuous.
    expect(files).toContain(IG_ROOT)
    expect(files).toContain(FB_ROOT)
    expect(files.length).toBeGreaterThan(20)
    expect(fromInstagram.size).toBeGreaterThan(5)
    expect(fromFacebook.size).toBeGreaterThan(5)
  })

  it('puts nothing at the components root', () => {
    // The root is where a component lands when nobody decided anything about it.
    expect(files.filter((file) => !file.includes(path.sep))).toEqual([])
  })

  it('labels a component for a network only while that is true of the graph', () => {
    const misfiled = files
      .filter((file) => {
        const folder = path.dirname(file)
        const shared = fromInstagram.has(file) && fromFacebook.has(file)
        if (folder === 'instagram') return shared || !fromInstagram.has(file)
        if (folder === 'facebook') return shared || !fromFacebook.has(file)
        if (folder === CHROME) return fromInstagram.has(file) || fromFacebook.has(file)
        return !shared
      })
      .map((file) => `${file} is in ${actualFolder(file)} but belongs in ${expectedFolder(file)}`)

    expect(misfiled).toEqual([])
  })
})

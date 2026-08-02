import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { TYPE_RAMP } from '@/utils/cn'

/**
 * The Closed Ramp Rule, enforced.
 *
 * DESIGN.md has described this rule since before the tokens existed, and it was
 * unenforceable the whole time: 645 call sites across three parallel type
 * systems, and nothing that failed when a 646th appeared.
 */

const SRC = path.resolve(__dirname, '../..')
const GLOBALS = path.join(SRC, 'app/globals.css')

/** Files that may hold a literal font size, each for a reason that is not drift. */
const INLINE_SIZE_EXEMPT = [
  // fontSize is a Konva document-model field here (z.number().min(8).max(400)),
  // not a style. A codemod through these corrupts saved user documents.
  'lib/canvas/',
  'features/canvas-editor/components/properties-panel.tsx',
  // Recharts spreads `tick` onto an SVG <text> as a presentation attribute, and
  // SVG attributes do not resolve var() -- a token here renders at the UA default.
  'features/analytics/lib/chart-config.ts',
  'features/analytics/components/audience-section.tsx',
  'features/analytics/components/post-day-breakdown.tsx',
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(SRC)
  return out
}

const rel = (f: string) => path.relative(SRC, f)
const files = sourceFiles()

/** True for a bare role name; false for its --line-height / --letter-spacing pair. */
const isRole = (name: string) => !name.endsWith('-line-height') && !name.endsWith('-letter-spacing')

/** Every `--text-<role>: <px>` in the @theme block, pairs excluded. */
function declaredSizes(): Map<string, string> {
  const css = readFileSync(GLOBALS, 'utf8')
  const sizes = new Map<string, string>()
  for (const m of css.matchAll(/--text-([a-z0-9-]+):\s*([\d.]+px)/g)) {
    const [, name, value] = m
    if (name && value && isRole(name)) sizes.set(name, value)
  }
  return sizes
}

const declaredTokens = (): string[] => [...declaredSizes().keys()]

describe('the type ramp', () => {
  it('is the same set of steps in globals.css and cn.ts', () => {
    // A step missing from TYPE_RAMP does not fail loudly: tailwind-merge files it
    // under text-*colour* instead of font-size and deletes whatever colour
    // precedes it. That shipped once as white-on-Deep-Pine buttons (c493950).
    expect([...TYPE_RAMP].sort()).toEqual(declaredTokens().sort())
  })

  it('has no step that another step is within a pixel of', () => {
    // The rule the previous ramp broke: fourteen steps with six inside 2.5px.
    const px = [...declaredSizes().values()].map(parseFloat).sort((a, b) => a - b)
    const tooClose = px.filter((v, i) => i > 0 && v - (px[i - 1] as number) < 1)
    expect(tooClose).toEqual([])
  })

  it('only reads var(--text-*) tokens that exist', () => {
    const declared = new Set(declaredTokens())
    const bad: string[] = []
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/var\(--text-([a-z0-9-]+)\)/g)) {
        const name = m[1]
        if (name && !declared.has(name)) bad.push(`${rel(f)}: --text-${name}`)
      }
    }
    // An undefined var makes the declaration invalid at computed-value time, so
    // the element silently inherits rather than erroring.
    expect(bad).toEqual([])
  })

  it("uses no class from Tailwind's default size scale", () => {
    const bad: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const m = line.match(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
          if (m) bad.push(`${rel(f)}:${i + 1}  ${m[0]}`)
        })
    }
    expect(bad).toEqual([])
  })

  it('uses no bracket pixel literal', () => {
    const bad: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // Anchored on px, so page-header's deliberately em-relative
          // text-[0.55em] -- which scales with an animated font-size -- passes.
          const m = line.match(/\btext-\[[\d.]+px\]/)
          if (m) bad.push(`${rel(f)}:${i + 1}  ${m[0]}`)
        })
    }
    expect(bad).toEqual([])
  })

  it('sets no literal inline font size', () => {
    const bad: string[] = []
    for (const f of files) {
      if (INLINE_SIZE_EXEMPT.some((p) => rel(f).startsWith(p) || rel(f) === p)) continue
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // Permits fontSize: 'var(--text-body)'; catches numbers and px strings.
          const m = line.match(/fontSize:\s*(\d|['"`]\d)/)
          if (m) bad.push(`${rel(f)}:${i + 1}`)
        })
    }
    expect(bad).toEqual([])
  })

  it('matches the sizes DESIGN.md publishes as the ramp', () => {
    // The frontmatter is what other tools read. It is the artifact most likely
    // to rot, because nothing compiles it.
    const md = readFileSync(path.resolve(SRC, '../DESIGN.md'), 'utf8')
    const block = md.slice(md.indexOf('typography:'), md.indexOf('rounded:'))
    const documented = new Map<string, string>()
    // Quote-agnostic: prettier normalises this frontmatter to single quotes, and
    // a guard that only reads double quotes silently matches nothing and passes
    // an empty set against an empty set.
    for (const m of block.matchAll(
      /^ {2}([a-z0-9-]+):\n(?:.*\n)*?\s*fontSize: ['"]([^'"]+)['"]/gm
    )) {
      const [, role, size] = m
      if (role && size) documented.set(role, size)
    }
    // Both sides are parsed, so an empty match on both would compare {} to {}
    // and pass while checking nothing. Assert they found something first.
    expect(documented.size).toBeGreaterThan(0)
    expect(declaredSizes().size).toBeGreaterThan(0)
    expect(Object.fromEntries(documented)).toEqual(Object.fromEntries(declaredSizes()))
  })
})

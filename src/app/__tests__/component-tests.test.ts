import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { UNTESTED_COMPONENTS } from './untested-components'

/**
 * Interactive components have component tests.
 *
 * TECH-DEBT §7.12 measured what the alternative costs: across the canvas-editor arc,
 * eight interactive defects reached a human or nobody, because `vitest` ran node-only and
 * there was no way to render anything. Three of those eight — a panel unreachable by
 * keyboard, ⌘Z passing through an open dialog, apply-style needing two clicks — are
 * exactly what a rendering test sees.
 *
 * **This does not replace the browser pass.** The same section found the other five were
 * layout (a `flex-1` under a block parent, a `backdrop-filter` capturing `position:
 * fixed`, a Label role's tracking clipping a word), and jsdom has no layout engine. It
 * cannot see any of them. This guard buys the lifecycle/keyboard/state third; the manual
 * pass and, eventually, Playwright buy the rest.
 *
 * The rule: a `'use client'` component that owns state or an effect must be imported by
 * some `*.test.tsx`. Imported by *some* test rather than having a file of its own, so a
 * group like `form-controls.test.tsx` can legitimately cover four controls at once.
 *
 * A component with no state and no effect is a rendering function — its output is its
 * props, and a test would restate the JSX. Those are out of scope on purpose.
 */

const SRC = path.resolve(__dirname, '../..')

/** Owns state or an effect — i.e. has behaviour a rendering test can observe. */
const INTERACTIVE = /\buseState\s*[<(]|\buseReducer\s*[<(]|\buseEffect\s*\(/

function walk(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = []
  const step = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') step(full)
      } else if (keep(entry.name)) {
        out.push(full)
      }
    }
  }
  step(dir)
  return out
}

/** Every interactive client component, as a src-relative path. */
function interactiveComponents(): string[] {
  return walk(SRC, (name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .filter((file) => {
      const body = readFileSync(file, 'utf8')
      return body.includes("'use client'") && INTERACTIVE.test(body)
    })
    .map((file) => path.relative(SRC, file))
    .sort()
}

/**
 * Module specifiers every component test imports, normalised to src-relative paths.
 *
 * Both import styles resolve here: `@/features/x/y` and a relative `../components/y`.
 * Matching on the specifier rather than on a filename convention is what lets one test
 * file cover several components, and what stops a test being credited to a component it
 * merely sits next to.
 */
function componentsUnderTest(): Set<string> {
  const covered = new Set<string>()
  for (const file of walk(SRC, (name) => name.endsWith('.test.tsx'))) {
    const body = readFileSync(file, 'utf8')
    for (const [, specifier] of body.matchAll(/from\s+'([^']+)'/g)) {
      if (!specifier) continue
      const resolved = specifier.startsWith('@/')
        ? specifier.slice(2)
        : specifier.startsWith('.')
          ? path.relative(SRC, path.resolve(path.dirname(file), specifier))
          : null
      if (resolved) covered.add(`${resolved}.tsx`)
    }
  }
  return covered
}

describe('interactive components have tests', () => {
  const components = interactiveComponents()
  const covered = componentsUnderTest()

  it('finds the components to check', () => {
    // A walker that matched nothing would make every assertion below vacuous.
    expect(components.length).toBeGreaterThan(50)
  })

  it('resolves what the component tests import', () => {
    expect(covered.size).toBeGreaterThan(5)
  })

  const untested = components.filter((file) => !covered.has(file))

  it('has no NEW interactive component without a test', () => {
    // Write a `*.test.tsx` that imports it. Adding a line to UNTESTED_COMPONENTS is
    // possible and sometimes right, but it is a deliberate act that shows up in review —
    // which is the whole point. It must never be the path of least resistance.
    expect(untested.filter((file) => !UNTESTED_COMPONENTS.includes(file))).toEqual([])
  })

  it('has no stale UNTESTED_COMPONENTS entry', () => {
    // Covering a component without deleting its line would leave the backlog looking
    // larger than it is, and quietly re-permit it later. Same contract as
    // row-mirrors.test.ts and boundary-validation.test.ts.
    expect(UNTESTED_COMPONENTS.filter((file) => !untested.includes(file))).toEqual([])
  })
})

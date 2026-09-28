import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const CRON = path.resolve(__dirname, '..')
const SRC = path.resolve(__dirname, '../../../..')

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full)
      } else if (keep(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

const cronSources = filesUnder(CRON, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

/**
 * The modules a file imports from this codebase, resolved to files — one level down. A cron's
 * work may sit in what its route delegates to (`./helpers`, the publish scheduler, the scheduled
 * batch), so the sweeps below read those too.
 */
function firstLevelImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(/from\s+'([^']+)'/g)]
    .map((m) => m[1] ?? '')
    .flatMap((spec) => {
      if (spec.startsWith('@/')) return [path.join(SRC, spec.slice(2))]
      if (spec.startsWith('./')) return [path.join(path.dirname(file), spec)]
      return []
    })
    .flatMap((base) => ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext))
    .filter((candidate) => {
      try {
        return readFileSync(candidate, 'utf8').length > 0
      } catch {
        return false
      }
    })
}

/** Every cron source and every first-level module a cron route delegates to. */
const cronReach = [
  ...new Set([
    ...cronSources,
    ...cronSources.filter((file) => file.endsWith('route.ts')).flatMap(firstLevelImports),
  ]),
]

/** If a scheduled run should ever consume ideas, delete this test deliberately; never widen its filter. */
describe('the scheduler never generates from a client idea: an idea is a request until someone at the agency agrees to it', () => {
  it('no cron route, nor what it delegates to, reads client_ideas or the ideas data layer', () => {
    const offenders = cronReach.flatMap((file) => {
      const body = readFileSync(file, 'utf8')
      return body
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(
          ({ line }) =>
            !line.startsWith('//') &&
            !line.startsWith('*') &&
            (line.includes('client_ideas') ||
              line.includes('features/ideas') ||
              line.includes('idea_form_tokens'))
        )
        .map(({ n, line }) => `${path.relative(SRC, file)}:${n} — ${line}`)
    })

    expect(offenders).toEqual([])
  })

  it('found the cron routes it guards and the scheduled batch they delegate to, so a path typo cannot pass the sweep', () => {
    const names = cronSources.map((file) => path.relative(CRON, file))
    expect(names).toContain(path.join('generate', 'route.ts'))
    expect(names.length).toBeGreaterThanOrEqual(4)
    expect(cronReach.map((file) => path.relative(SRC, file))).toContain(
      path.join('lib', 'generation', 'scheduled-run.ts')
    )
  })
})

describe('one writer per run-progress table', () => {
  it('generation_themes is written in exactly one place, so every path records a theme the same way', () => {
    const sources = filesUnder(SRC, (name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    const writers = sources.filter((file) =>
      readFileSync(file, 'utf8').includes("from('generation_themes')")
    )

    expect(writers.map((file) => path.relative(SRC, file))).toEqual([
      path.join('lib', 'generation', 'runs.ts'),
    ])
  })
})

/**
 * Files that write the column to the table, not ones that merely name it: a file must call
 * `.from('post_publications')` and spell the column as an object key (`publish_attempts:`). The
 * generated `types/database.ts` declares the key but queries no table; the scheduler queries the
 * table but names the column only in filters and reads.
 */
function publicationWriters(pattern: RegExp): string[] {
  return filesUnder(SRC, (name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .filter((file) => {
      const src = readFileSync(file, 'utf8')
      return src.includes(".from('post_publications')") && pattern.test(src)
    })
    .map((file) => path.relative(SRC, file))
    .sort()
}

describe('the publish queue can always be re-entered', () => {
  it('publish_attempts, the retry budget, is written in exactly one place, so nothing spends it unseen by the scheduler', () => {
    expect(publicationWriters(/publish_attempts:\s/)).toEqual([
      path.join('features', 'publishing', 'lib', 'publication-store.ts'),
    ])
  })

  it('that one place is also the only thing that resets it to zero, so no destination loops past MAX_ATTEMPTS', () => {
    expect(publicationWriters(/publish_attempts:\s*0\b/)).toEqual([
      path.join('features', 'publishing', 'lib', 'publication-store.ts'),
    ])
  })
})

describe('every cron that can spend money or publish is gated by the entitlement, so a paused workspace stops costing money', () => {
  const EXEMPT: Record<string, string> = {
    'refresh-tokens':
      'One free Meta call per expiring token keeps a paused workspace reconnectable; gating it would make reactivation require a reconnect.',
    billing:
      'Spends nothing and publishes nothing: it reads the entitlement to decide whom to remind of a trial ending, and never a provider.',
  }
  const GATE = /@\/lib\/billing\/entitl/

  it('each cron route reaches the gate directly or through what it delegates to, since nothing upstream of a cron asks', () => {
    const routes = cronSources.filter((file) => file.endsWith('route.ts'))
    const ungated = routes
      .filter((file) => !(path.basename(path.dirname(file)) in EXEMPT))
      .filter((file) => {
        const sources = [file, ...firstLevelImports(file)].map((f) => readFileSync(f, 'utf8'))
        return !sources.some((src) => GATE.test(src))
      })
      .map((file) => path.relative(CRON, file))

    expect(ungated).toEqual([])
    expect(routes.length).toBeGreaterThanOrEqual(6)
  })
})

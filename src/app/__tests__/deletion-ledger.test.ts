import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../..')

/**
 * The pipeline-refactor deletion ledger, made permanent.
 *
 * Nothing in the toolchain catches an orphaned export — no knip or ts-prune in
 * devDependencies, and no-unused-vars only flags locals. That is exactly how a
 * 20-caption query with zero readers and a "single source of truth" string with
 * no importers survived for months. These assertions make the 2026-08 deletions
 * stick: a change that re-introduces one of these names has to delete its line
 * here, which is the conversation the ledger exists to force.
 *
 * A general unused-export detector is deliberately NOT attempted: Next.js route
 * files legitimately export POST/GET/maxDuration with no in-repo referrer, so it
 * would need an allow-list large enough to hide real findings.
 */

function walkSources(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push({ file: path.relative(SRC, full), body: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(SRC)
  return out
}

const OWN_FILE = path.join('app', '__tests__', 'deletion-ledger.test.ts')

describe('deleted files stay deleted', () => {
  it.each([
    'src/ai/research/search-for-idea.ts',
    'src/app/api/ai/generate-from-idea',
    'src/app/api/ideas/route.ts',
    'src/features/sources/lib/ensure-web-research-source.ts',
    'src/features/ideas/components/idea-card.tsx',
    'src/features/ideas/lib/cache.ts',
  ])('%s does not exist', (relPath) => {
    expect(existsSync(path.resolve(SRC, '..', relPath))).toBe(false)
  })
})

describe('deleted symbols stay unreferenced', () => {
  // Comment lines are skipped: prose may name a retired symbol to explain its
  // absence. Code may not.
  const DELETED = [
    'generateTopUpTopics',
    'IDEA_STAGE_LABELS',
    'GenerateStreamEvent',
    'ResearchStreamEvent',
    'NEUTRAL_FALLBACK_SCORE',
    'topPerformingPosts',
    'fetchTopPostsByClient',
    'ensureWebResearchSource',
    'sanitizePromptArray',
  ]

  it('no source line mentions a ledgered symbol', () => {
    const sources = walkSources().filter(({ file }) => file !== OWN_FILE)
    const offenders = sources.flatMap(({ file, body }) =>
      body
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(
          ({ line }) =>
            !line.startsWith('//') &&
            !line.startsWith('*') &&
            DELETED.some((symbol) => line.includes(symbol))
        )
        .map(({ n, line }) => `src/${file}:${n} — ${line}`)
    )

    expect(offenders).toEqual([])
  })

  it("the idea lifecycle has three statuses — 'generating' is retired", () => {
    const apiTypes = readFileSync(path.resolve(SRC, 'types/api.ts'), 'utf8')
    const unionLine = apiTypes.split('\n').find((line) => line.includes('export type IdeaStatus'))

    expect(unionLine).toBeDefined()
    expect(unionLine).not.toContain('generating')
  })

  it('found the tree it means to be guarding', () => {
    // A path typo would make the sweep pass by scanning nothing at all.
    const sources = walkSources()
    expect(sources.length).toBeGreaterThan(400)
    expect(sources.some(({ file }) => file === path.join('types', 'api.ts'))).toBe(true)
  })
})

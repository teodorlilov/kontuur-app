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

describe('the scheduler never generates from a client idea', () => {
  /**
   * A client idea is a request, not an instruction.
   *
   * Someone at the agency has to decide an idea is worth making before it becomes a
   * post — auto-generating from an unread one would put a client's words into
   * production with nobody having agreed to them, and the client would first learn
   * of it by seeing it published.
   *
   * This held by accident before: the generate cron passed `priorityPosts: []` and
   * simply never queried the table. That is exactly the kind of invariant that
   * survives until someone adds a plausible-looking feature. It is now checked.
   *
   * If a scheduled run ever *should* consume ideas, this test is the conversation —
   * delete it deliberately, do not widen it.
   */
  it('no cron route reads client_ideas or the ideas data layer', () => {
    const offenders = cronSources.flatMap((file) => {
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

  it('found the cron routes it means to be guarding', () => {
    // A path typo would make the sweep above pass by checking nothing at all.
    const names = cronSources.map((file) => path.relative(CRON, file))
    expect(names).toContain(path.join('generate', 'route.ts'))
    expect(names.length).toBeGreaterThanOrEqual(4)
  })
})

describe('one writer per run-progress table', () => {
  /**
   * `generation_themes` was inserted from three routes, each discarding the error,
   * so a theme could silently fail to record on one path and not the others — and
   * the run panel would report progress that never matched what was generated.
   * `trackGenerationTheme` in lib/generation/runs.ts is the single writer, which
   * its own JSDoc had already claimed to be.
   */
  it('generation_themes is written in exactly one place', () => {
    const sources = filesUnder(SRC, (name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    const writers = sources.filter((file) =>
      readFileSync(file, 'utf8').includes("from('generation_themes')")
    )

    expect(writers.map((file) => path.relative(SRC, file))).toEqual([
      path.join('lib', 'generation', 'runs.ts'),
    ])
  })
})

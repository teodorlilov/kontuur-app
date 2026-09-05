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

describe('the publish queue can always be re-entered', () => {
  /**
   * `publish_attempts` is the gate on the whole queue: `publishDuePosts` selects
   * `.lt('publish_attempts', MAX_ATTEMPTS)`, so a post at the limit is invisible to
   * the scheduler no matter what its status says. A row can therefore sit on the
   * calendar reading "Scheduled" and never be picked up again.
   *
   * Two files may touch it, and each has a different job:
   *
   * - `publish-post.ts` **increments** it when claiming a post — the single
   *   implementation both the cron scheduler and the manual publish route run,
   *   so a hand-fired attempt counts against the same budget by construction.
   * - `post-recovery.ts` is the only thing that **resets** it, and it is the reason
   *   a failed post can be revived at all.
   *
   * A third writer is the thing to catch. An incrementer added elsewhere would spend
   * the budget without the scheduler knowing; a second resetter would let a post loop
   * past MAX_ATTEMPTS forever, which is the runaway this ceiling exists to stop.
   */
  /**
   * Files that write the column to the **table**, not ones that merely name it.
   *
   * `types/database.ts` declares it because it is generated from the schema, and the
   * calendar's optimistic patch sets it in local React state, where no ceiling applies
   * because no query reads it. Requiring `from('posts')` alongside is what separates a
   * write from a mention.
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

  it('publish_attempts is written in exactly one place', () => {
    // It moved off `posts` onto `post_publications` when a post gained more than one
    // destination — two networks retry independently, so one counter could not serve both.
    // With a store owning the table, the two writers this used to permit became one.
    expect(publicationWriters(/publish_attempts:\s/)).toEqual([
      path.join('features', 'publishing', 'lib', 'publication-store.ts'),
    ])
  })

  it('that one place is also the only thing that resets it to zero', () => {
    // The half that actually matters. Every other path adds to the count; if a second file
    // starts zeroing it, MAX_ATTEMPTS stops being a ceiling.
    expect(publicationWriters(/publish_attempts:\s*0\b/)).toEqual([
      path.join('features', 'publishing', 'lib', 'publication-store.ts'),
    ])
  })
})

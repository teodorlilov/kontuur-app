import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const SCRIPT = path.join(ROOT, 'scripts/plan-check.mjs')

/**
 * Runs the plan checker on a plan written to a temp file; returns the exit code and combined output.
 * The script exits 1 on a contradicted claim and prints each one, which is what these pin.
 */
function check(plan: string): { code: number; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-check-'))
  const file = path.join(dir, 'plan.md')
  writeFileSync(file, plan)
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, file], { encoding: 'utf8' }) }
  } catch (err) {
    const failed = err as { status: number; stdout: string; stderr: string }
    return { code: failed.status, out: `${failed.stdout}${failed.stderr}` }
  }
}

const TABLE_HEAD = `## Verified before writing

| Symbol | Where | Exported | On error | Cache | Notes |
|---|---|---|---|---|---|
`

describe('scripts/plan-check.mjs', () => {
  it('passes a plan whose every claim matches the code', () => {
    const { code, out } = check(
      TABLE_HEAD +
        '| `hasLiveChannel` | `src/features/clients/lib/roster.ts` | yes | pure | — | |\n' +
        '| `getMondayISO`, `shiftDateKey` | `utils/date-helpers.ts` | yes | pure | — | |\n' +
        '\nThe change touches `src/lib/queries/cache.ts` and adds `src/features/x/new-thing.ts` (new).\n'
    )
    expect(out).toContain('2 verified rows checked')
    expect(code).toBe(0)
  })

  it('fails when a row calls a private function exported', () => {
    const { code, out } = check(
      TABLE_HEAD + '| `walk` | `scripts/table-writers.mjs` | yes | — | — | private helper |\n'
    )
    expect(code).toBe(1)
    expect(out).toContain('walk is NOT exported')
  })

  it('fails when a cited symbol is not in the cited file', () => {
    const { code, out } = check(
      TABLE_HEAD + '| `buildChannels` | `src/utils/date-helpers.ts` | yes | — | — | |\n'
    )
    expect(code).toBe(1)
    expect(out).toContain('buildChannels does not appear in src/utils/date-helpers.ts')
  })

  it('fails when a cited path does not exist and when a shorthand is ambiguous', () => {
    const { code, out } = check(
      'See `src/lib/queries/does-not-exist.ts`, the page at `page.tsx:45`, and any `page.tsx`.\n' +
        TABLE_HEAD
    )
    expect(code).toBe(1)
    expect(out).toContain('cited path does not exist')
    expect(out).toMatch(/page\.tsx names \d+ files/)
    expect(out).toContain('2 cited paths')
  })

  it('fails a plan with no verified table at all', () => {
    const { code, out } = check('# A plan\n\nJust prose about `src/lib/queries/cache.ts`.\n')
    expect(code).toBe(1)
    expect(out).toContain('no "## Verified before writing" table')
  })
})

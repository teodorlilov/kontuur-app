import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Every write of `client_sources.url` goes through the SSRF check.
 *
 * `action-validation.test.ts` exempts this file from the zod rule on the grounds that
 * "validateSourceUrl (SSRF + scheme + host) ... runs before any write". That was not true.
 * `createSource` called it; `updateSource` wrote `updates.url.trim()` straight into the column, so
 * the guard belonged to one ENTRY POINT rather than to the column, and editing a source reached
 * addresses adding one could not. The research pipeline fetches whatever the row holds and cannot
 * tell which path wrote it.
 *
 * Structural because the property is structural: the risk is a THIRD writer appearing that skips
 * the gate, and no behavioural test of the two current callers would notice that.
 */

const SOURCE = path.join(process.cwd(), 'src/features/sources/actions/source-actions.ts')

describe('client_sources.url is never written unguarded', () => {
  const src = readFileSync(SOURCE, 'utf8')

  it('funnels the raw value through one resolver', () => {
    expect(src).toMatch(/async function resolveSourceUrl\(/)
    // The resolver is the only thing that may call the checker; everything else asks the resolver.
    const guardCalls = src.match(/validateSourceUrl\(/g) ?? []
    expect(guardCalls).toHaveLength(1)
  })

  it('assigns no url into a write without passing the resolver first', () => {
    // The exact shape the hole had: a trimmed field going straight into the payload.
    expect(src).not.toMatch(/url:\s*\w+\.url\.trim\(\)/)
    expect(src).not.toMatch(/fields\.url\s*=\s*\w+\.url\.trim\(\)/)
  })

  it('has both writers reject with the same words', () => {
    // A create that says "must be a public http/https URL" and an edit that says something else
    // teaches the user that the rules differ, when the only difference was which one enforced them.
    const refusals = src.match(/error:\s*INVALID_URL/g) ?? []
    expect(refusals.length).toBeGreaterThanOrEqual(2)
  })
})

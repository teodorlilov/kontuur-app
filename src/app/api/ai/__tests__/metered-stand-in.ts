/**
 * The `runMetered` the AI route tests swap into their `@/lib/billing/usage` mock. What the real one
 * (src/lib/billing/usage.ts) does with the callback's outcome is its own test
 * (src/lib/billing/__tests__/usage.test.ts); a route test only needs the whole landing to run under
 * it, and reads in `outcomes` whether that landing resolved or threw. Not a test itself.
 */

/** How each landing ended, in order; a test empties it before each case. */
export const outcomes: Array<'landed' | 'thrown'> = []

/** Run the landing, record how it ended, and pass its result or its throw on unchanged. */
export async function metered<T>(_spender: unknown, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn()
    outcomes.push('landed')
    return result
  } catch (err) {
    outcomes.push('thrown')
    throw err
  }
}

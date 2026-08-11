import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Unwrap a Supabase read, turning a query error into a throw.
 *
 * Query helpers sit below the boundary, so a failed read has to propagate:
 * returning null or [] instead would make a database outage indistinguishable
 * from "no rows" and render as an empty page rather than an error.
 *
 * Pair with `.maybeSingle()`, not `.single()`, wherever "no row" is a legitimate
 * answer — `.single()` reports a missing row *as* an error, which this would then
 * escalate into a 500 for what is really a null.
 */
export function unwrap<T>(
  result: { data: T; error: PostgrestError | null },
  query: string
): T {
  if (result.error) throw new Error(`${query} failed: ${result.error.message}`)
  return result.data
}

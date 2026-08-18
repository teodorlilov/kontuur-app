import { z } from 'zod'
import { formatZodIssues } from '@/lib/validation/format-issues'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Every id crossing a server-action boundary is a database uuid.
 *
 * Declared once so the four actions that take a bare id cannot each decide how much to
 * trust it. Without this, a non-uuid string reaches `.eq('id', …)` and Postgres rejects
 * the comparison itself — the action then reports a database error where it means
 * "that is not an id", and the caller cannot tell a malformed request from an outage.
 */
const uuid = z.uuid()

/**
 * Parses an id argument, returning either the value or the failed `ActionResult` to
 * return as-is.
 *
 * Shaped as a union rather than a throw because server actions answer with
 * `ActionResult` and never with an exception — the caller is a form handler, and an
 * uncaught throw there is a Next.js error boundary, not a message.
 */
export function parseActionId(
  value: string,
  label: string
): { ok: true; id: string } | { ok: false; result: ActionResult<never> } {
  const parsed = uuid.safeParse(value)
  if (parsed.success) return { ok: true, id: parsed.data }
  return { ok: false, result: { ok: false, error: `${label}: ${formatZodIssues(parsed.error)[0]}` } }
}

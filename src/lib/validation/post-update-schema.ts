import { z } from 'zod'
import { isUserSettablePostStatus, isValidPostPlatform } from '@/lib/validation'

/**
 * What a user may write to a post — the one whitelist.
 *
 * It was two. `updatePost` (the server action) and `PUT /api/posts/[id]` each restated
 * the same eleven fields line-for-line as `if (x !== undefined) updates.x = x`, and the
 * two had already drifted: the route validated `quality_score_avg` as number-or-null and
 * the action did not, while the action's `UpdatePostInput` typed it as `number` only.
 * **Neither validated `scheduled_at`** — the column the whole calendar reads — so any
 * string at all could be written to it and would then fail to parse in five places.
 *
 * A schema rather than a second interface, because this is a *write contract* and the
 * things it must say ("a settable status", "an instant, or null to unschedule") are
 * runtime facts that a TypeScript shape cannot check on data arriving as JSON.
 *
 * `status` and `platform` defer to the two exported gates rather than re-deriving their
 * enums. `isValidPostPlatform` checks `PLATFORMS` — five display-case names — not the
 * two-member connection vocabulary in `POST_PLATFORMS`, and a `z.enum(POST_PLATFORMS)`
 * here would have started rejecting `'Instagram'` on the one column that stores it.
 */
export const updatePostSchema = z
  .object({
    status: z.string().refine(isUserSettablePostStatus),
    caption: z.string(),
    slides_json: z.unknown(),
    /**
     * An instant, or `null` to unschedule. `offset: true` because the app writes
     * `toISOString()` (a `Z`) everywhere today, and an offset form is the same instant
     * — rejecting it would be arbitrary. What is rejected is a bare `2026-08-14`, which
     * is a wall-clock date with no zone and the ambiguity Phase 1 exists to remove.
     */
    scheduled_at: z.iso.datetime({ offset: true }).nullable(),
    platform: z.string().refine(isValidPostPlatform),
    was_rewritten: z.boolean(),
    rewrite_count: z.number().int().nonnegative(),
    source_url: z.string(),
    source_title: z.string(),
    /** `null` is a real value — "nobody judged this" — and must not become 0. */
    quality_score_avg: z.number().nullable(),
    validation_json: z.unknown(),
  })
  .partial()

/**
 * The write contract as a type, replacing the hand-written `UpdatePostInput`.
 *
 * Still not derived from `PostRow`, and for the reason its `row-mirrors` exemption gave
 * before it: deriving would turn `source_url?: string` into `string | null` and start
 * admitting nulls the update path never intended.
 */
export type UpdatePostInput = z.infer<typeof updatePostSchema>

type PostUpdateParse =
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string }

/** Primitives can be shown back to the caller verbatim; an object cannot. */
function shows(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

/**
 * Validate an update and reduce it to the columns actually being written.
 *
 * Returns the payload rather than the parsed object so both callers get the same
 * answer to the same question — *which columns is this write touching* — instead of
 * each rebuilding it from the schema and having one of them forget a field.
 *
 * A key set to `undefined` is skipped, not written as `null`; that is the semantic the
 * two `if (x !== undefined)` blocks had, and callers spread conditionals into these
 * objects (`...(platform ? { platform } : {})`) on that basis.
 */
export function parsePostUpdate(input: unknown): PostUpdateParse {
  const parsed = updatePostSchema.safeParse(input)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    if (!issue || issue.path.length === 0) return { ok: false, error: 'Invalid request body' }

    const field = issue.path.join('.')
    const received =
      input && typeof input === 'object' ? (input as Record<string, unknown>)[field] : undefined
    // Keeps the two messages these call sites already returned — "Invalid status: draft"
    // — rather than replacing them with zod's own phrasing.
    return {
      ok: false,
      error: `Invalid ${field}: ${shows(received) ? String(received) : issue.message}`,
    }
  }

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value
  }
  return { ok: true, updates }
}

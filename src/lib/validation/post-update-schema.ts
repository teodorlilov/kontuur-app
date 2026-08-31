import { z } from 'zod'
import { isUserSettablePostStatus, isValidPostPlatform } from '@/lib/validation'

/**
 * What a user may write to a post's WORKFLOW state — status, slot, platform, provenance, judgement.
 *
 * It was two schemas, then it was one covering too much. `updatePost` and a since-deleted
 * `PUT /api/posts/[id]` each restated the same eleven fields as `if (x !== undefined)`, and had
 * already drifted: the route validated `quality_score_avg` as number-or-null and the action did
 * not. Neither validated `scheduled_at` — the column the whole calendar reads — so any string at
 * all could be written to it and would then fail to parse in five places.
 *
 * `caption` and `slides_json` have since left this list. They are a post's COPY, they had three
 * writers between them, and one editing session in the review queue used two of the three. They
 * now live in `postCopySchema` below, written only by `savePostCopy`. The split is the point: a
 * caller changing a post's place in the workflow and a caller saving what someone typed are
 * different operations, and were only ever one schema because one function happened to do both.
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

/**
 * The two columns that carry a post's COPY, split out so one function owns them.
 *
 * They were in the whitelist above, and three actions wrote them: `updatePost` through this schema,
 * `savePostCopy` through a hand-written duplicate of these exact two fields, and a PUT route that
 * restated the whole thing again. The review queue used two of the three in a single editing
 * session — savePostCopy on every autosave flush, updatePost on approve.
 *
 * Kept in this file rather than beside the action so both halves of the write contract stay in one
 * place; the action imports it. Whoever adds a column here still only has one place to look.
 */
export const postCopySchema = z
  .object({
    caption: z.string(),
    slides_json: z.unknown(),
  })
  /**
   * Partial, because the calendar's caption box saves on blur with no slides in hand
   * (schedule-card.tsx:545) while the review queue's autosave sends both. A required shape here
   * would force those callers to invent a value for the half they are not editing, and the obvious
   * invention — an empty string — silently blanks a caption when only the slides changed.
   */
  .partial()

export type PostCopyInput = z.infer<typeof postCopySchema>

type PostUpdateParse = { ok: true; updates: Record<string, unknown> } | { ok: false; error: string }

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

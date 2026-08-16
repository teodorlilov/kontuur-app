import { z } from 'zod'

/**
 * Zod schemas for the canvas editor's own route boundaries.
 *
 * The asset-target union is deliberately NOT re-described here: `resolveAssetDestination`
 * (features/publishing/lib/asset-destination.ts) owns that decision — it verifies ownership and
 * returns the uploader bound to the right storage family, and it emits the canonical 400 when
 * neither id set is present. A second validator here would be a second place for that rule to drift.
 */

/** Art direction the user types into the editor's generate bar. */
const MAX_DIRECTION_CHARS = 500

/**
 * The copy a slide carries, as the editor holds it. The client sends this rather than the server
 * re-deriving it: a wizard draft has no row to read (it lives in browser memory until approve), and
 * a persisted post's row can be behind unsaved edits the user is looking at right now.
 */
const slideCopySchema = z.union([
  z.object({
    kind: z.literal('slide'),
    headline: z.string(),
    body: z.string(),
  }),
  z.object({
    kind: z.literal('caption'),
    caption: z.string().nullable(),
  }),
])

/**
 * Generate a fresh background for the slide being edited. Target ids are passed through untouched
 * for `resolveAssetDestination` to verify; `direction` is optional, and its absence means "same
 * copy, roll the dice again" — gpt-image-2 is stochastic, so that alone yields a different image.
 */
export const generateBackgroundSchema = z.object({
  clientId: z.string().optional(),
  draftId: z.string().optional(),
  postId: z.string().optional(),
  slideCopy: slideCopySchema.nullable().optional(),
  direction: z.string().trim().max(MAX_DIRECTION_CHARS).optional(),
})

export type GenerateBackgroundBody = z.infer<typeof generateBackgroundSchema>

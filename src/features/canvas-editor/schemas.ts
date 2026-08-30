import { z } from 'zod'
import { colorSchemeSchema } from '@/lib/visual/identity-schema'

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
 * The ceiling on copy the client hands back for the server to prompt with.
 *
 * Generous — a slide's headline and body are a sentence each, and the caption path carries a whole
 * post — but a ceiling nonetheless. Every field here is spent on a paid image model, and `direction`
 * beside it was capped while these were not: the field a user types in was bounded and the fields a
 * user can PUT ANYTHING IN, because they arrive from the client rather than from the row, were not.
 */
const MAX_COPY_CHARS = 4000

/**
 * The copy a slide carries, as the editor holds it. The client sends this rather than the server
 * re-deriving it: a wizard draft has no row to read (it lives in browser memory until approve), and
 * a persisted post's row can be behind unsaved edits the user is looking at right now.
 */
const slideCopySchema = z.union([
  z.object({
    kind: z.literal('slide'),
    headline: z.string().max(MAX_COPY_CHARS),
    body: z.string().max(MAX_COPY_CHARS),
  }),
  z.object({
    kind: z.literal('caption'),
    caption: z.string().max(MAX_COPY_CHARS).nullable(),
  }),
])

/**
 * The three target ids every canvas-asset route accepts, in the shape
 * `resolveAssetDestination` reads them.
 *
 * Shape only. Which combination is legal, and who owns the row, stays entirely with
 * `resolveAssetDestination` for the reason in this file's header — this schema
 * deliberately cannot express "postId OR (clientId AND draftId)", because expressing it
 * here is how the two would drift.
 *
 * Optional rather than uuid: a caller sending a malformed id must reach the resolver and
 * get its canonical 404, not a 400 from here that says something subtly different about
 * an id the resolver would have rejected anyway.
 */
const assetTargetSchema = z.object({
  clientId: z.string().optional(),
  draftId: z.string().optional(),
  postId: z.string().optional(),
})

/**
 * Generate a fresh background for the slide being edited. Target ids are passed through untouched
 * for `resolveAssetDestination` to verify; `direction` is optional, and its absence means "same
 * copy, roll the dice again" — gpt-image-2 is stochastic, so that alone yields a different image.
 */
export const generateBackgroundSchema = assetTargetSchema.extend({
  slideCopy: slideCopySchema.nullable().optional(),
  direction: z.string().trim().max(MAX_DIRECTION_CHARS).optional(),
  /**
   * Which slide of how many. Sent because the server cannot know it — and because it was faked
   * before: the route hardcoded `(1, 3)`, which `slideRole` classifies as QUIET, so every picture
   * generated from the editor was briefed as "a restrained, minimal take, ONE small supporting
   * subject" while the comment above the call claimed it was asking for a richly detailed one.
   */
  position: z.number().int().min(0).optional(),
  total: z.number().int().min(1).optional(),
  /** A draft's colour pair. A post's is read from its row instead — see `EditorTarget`. */
  scheme: colorSchemeSchema.optional(),
  /**
   * What separates one press of Generate from the next.
   *
   * The server hashes it to pick a framing and a treatment, so two requests carrying the same value
   * get the same brief. The editor sends its slide's background plus a press counter; it used to
   * send the background alone, which does not change until a candidate is PICKED — so generating
   * three options to compare produced three takes on one brief.
   */
  nonce: z.string().trim().max(1024).optional(),
})

export type GenerateBackgroundBody = z.infer<typeof generateBackgroundSchema>

/**
 * Re-host an image the user pasted or dropped from the web.
 *
 * `url` is shape-checked only. Whether it is safe to fetch is `fetchRemoteImage`'s
 * decision (scheme, host, redirect and content-type checks), and a URL this schema
 * accepted still has to survive that.
 */
export const pasteFromUrlSchema = assetTargetSchema.extend({
  url: z.string().trim().min(1).max(2048),
})

/** Cut the subject out of an already-stored image. */
export const isolateSubjectSchema = assetTargetSchema.extend({
  storagePath: z.string().trim().min(1).max(1024),
})

/**
 * A vector prompt is capped tighter than `MAX_DIRECTION_CHARS`: Recraft takes a short
 * object description ("a leaf outline"), not a scene. The route enforced 300 before this
 * schema existed and keeps enforcing 300 — a schema is not the place to quietly widen
 * what an endpoint accepts.
 */
export const MAX_SVG_PROMPT_CHARS = 300

/** Generate a brand-palette vector element. */
export const generateSvgSchema = assetTargetSchema.extend({
  prompt: z.string().trim().min(1).max(MAX_SVG_PROMPT_CHARS),
})

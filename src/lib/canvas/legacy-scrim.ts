import { z } from 'zod'
import type { CanvasBackdrop } from '@/types/canvas'
import { HEX_COLOR } from '@/lib/validation'

/**
 * The "contrast scrim" as stored rows still hold it, and what it becomes now that it is the
 * backdrop.
 *
 * Its own file rather than a corner of `doc-schema`: both the v1 upgrade and the v2 read path need
 * the same mapping, and importing it from either into the other would close a cycle between two
 * modules whose zod schemas are built at import time.
 */

export const legacyScrimSchema = z.object({
  enabled: z.boolean(),
  color: z.string().regex(HEX_COLOR, 'must be a #rrggbb hex colour'),
  opacity: z.number().min(0).max(1),
  /** 'bottom' covered the lower half of the canvas; 'full' the whole of it. */
  mode: z.enum(['full', 'bottom']),
})

/**
 * A stored scrim as a backdrop.
 *
 * A 'bottom' scrim comes back OFF. There is no half-canvas backdrop to carry it to, and the two
 * honest alternatives are both worse: keeping it enabled would silently double the coverage the
 * slide was composed against, washing a picture the author only ever dimmed below the waist.
 * Turning it off is visible, and one click undoes it.
 */
export function backdropFromScrim(scrim: z.infer<typeof legacyScrimSchema>): CanvasBackdrop {
  return {
    enabled: scrim.enabled && scrim.mode === 'full',
    color: scrim.color,
    opacity: scrim.opacity,
  }
}

/**
 * A stored v2 doc with its `scrim` renamed to `backdrop`, or the input untouched when there is
 * nothing to rename.
 *
 * Read-only surgery: `parseCanvasDoc` (the write gate) never sees it, so a save that still carried
 * the old key would be rejected rather than quietly accepted for another round.
 */
export function withBackdrop(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const row = input as Record<string, unknown>
  if ('backdrop' in row || !('scrim' in row)) return input

  const legacy = legacyScrimSchema.safeParse(row.scrim)
  // A scrim too broken to read is left in place, so the doc schema reports the missing backdrop
  // against the row as it actually is instead of against a half-repaired copy.
  if (!legacy.success) return input

  const next: Record<string, unknown> = { ...row, backdrop: backdropFromScrim(legacy.data) }
  delete next.scrim
  return next
}

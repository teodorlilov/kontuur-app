/**
 * One slot of a draft's visuals as the shared review leaves render it — a slide's picture and
 * whether it is still being made. Projected from the post's `post_images` and the visuals hook's
 * in-flight positions by `toVisualSlots` (lib/visual/visual-slots.ts); every draft under review is a
 * row, so the picture's refs are the row's. `error` is a slot whose generation failed and waits for
 * Regenerate.
 */
export interface DraftVisual {
  position: number
  status: 'generating' | 'done' | 'error'
  publicUrl?: string
  storagePath?: string
}

/** Per-draft visual tallies for status chips and the review bar's note. */
export function countVisualsByStatus(visuals: DraftVisual[] | undefined): {
  failed: number
  composing: number
  done: number
} {
  let failed = 0
  let composing = 0
  let done = 0
  for (const visual of visuals ?? []) {
    if (visual.status === 'error') failed++
    else if (visual.status === 'generating') composing++
    else done++
  }
  return { failed, composing, done }
}

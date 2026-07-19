/**
 * The single source of truth linking a slide's **negative-space** (what the backdrop prompt asks the model
 * to leave clean) to its **text placement** (where the renderer puts the copy). Both `prompt.ts` and the
 * `SlideCanvas` read these, so the clean region and the text position can never drift.
 */

export type BackdropRole = 'cover' | 'interior' | 'cta'
export type NegativeSpace = 'bottom' | 'center' | 'top'

/** A normalized rectangle (0..1 of the frame) — where the copy + scrim are laid out. */
export type Rect = { x: number; y: number; w: number; h: number }

export const TEXT_ZONES: Record<BackdropRole, { negativeSpace: NegativeSpace; rect: Rect }> = {
  cover: { negativeSpace: 'bottom', rect: { x: 0.06, y: 0.6, w: 0.88, h: 0.34 } },
  interior: { negativeSpace: 'bottom', rect: { x: 0.06, y: 0.52, w: 0.88, h: 0.42 } },
  cta: { negativeSpace: 'center', rect: { x: 0.1, y: 0.34, w: 0.8, h: 0.32 } },
}

/** Map a carousel slide's role (`cover` | `content` | `cta`) to a backdrop role. */
export function toBackdropRole(slideRole: string | null | undefined): BackdropRole {
  if (slideRole === 'cover') return 'cover'
  if (slideRole === 'cta') return 'cta'
  return 'interior'
}

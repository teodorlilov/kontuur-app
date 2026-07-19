import type { BackdropRole } from './text-zones'

/** One thing to generate a backdrop for — a carousel slide, or a single post's one unit. */
export type VisualUnit = {
  /** Slide/position index (0-based); single posts use 0. */
  index: number
  role: BackdropRole
  headline: string
  body: string
}

/** A generated backdrop for one unit — `url` null when generation failed (renderer shows the gradient). */
export type BackdropResult = { index: number; url: string | null }

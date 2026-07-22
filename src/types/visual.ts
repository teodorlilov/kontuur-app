/**
 * Brand visual-identity domain types (Phase 1 foundation).
 *
 * Single source of truth for the shapes persisted in `brand_visual_identity` and returned by the
 * extraction pipeline. Internal pipeline types (ColorObservations, PageMeasurement, CaptureResult)
 * stay co-located in their modules — this file holds only the shared/persisted domain shapes.
 */

import type { BrandStyleId } from '@/lib/visual/brand-styles'

/** The five colour roles a kit is reduced to. `surface`/`ink` carry legible text; `accent` is the brand pop. */
export type ColorRole = 'surface' | 'ink' | 'accent' | 'accent-deep' | 'line'

/** A resolved brand palette, one hex per role. */
export type Palette = Record<ColorRole, string>

/** How a stored identity was produced. */
export type SourceKind = 'default' | 'website' | 'manual'

/** The full stored visual identity for a client: measured brand colours, the user-chosen brand style,
 *  and the Haiku-written palette description injected into image prompts (absent until first computed). */
export type VisualIdentity = {
  palette: Palette
  style: BrandStyleId
  palette_description?: string
}

/** How a given extracted field was arrived at, surfaced as a confidence badge in Review. */
export type Confidence = 'measured' | 'inferred' | 'guessed'

export type ExtractionField = 'colors' | 'accent'

/** Per-field confidence map plus any soft-fallback reason. */
export type ExtractionReport = {
  source: 'website' | 'fallback'
  confidence: Partial<Record<ExtractionField, Confidence>>
  fallback?: { reason: string }
}

/** What the extractor yields: a validated identity + its confidence report. */
export type ExtractionResult = { identity: VisualIdentity; report: ExtractionReport }

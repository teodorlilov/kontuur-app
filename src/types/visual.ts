/**
 * Brand visual-identity domain types (Phase 1 foundation).
 *
 * Single source of truth for the shapes persisted in `brand_visual_identity` and returned by the
 * extraction pipeline. Internal pipeline types (ColorObservations, PageMeasurement, CaptureResult)
 * stay co-located in their modules — this file holds only the shared/persisted domain shapes.
 */

import type { BrandFontChoice, BrandStyleId } from '@/lib/visual/brand-styles'

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
  /** The client's own type pairing, overriding their style's. Absent = the style decides. */
  fonts?: BrandFontChoice
}

/**
 * How an identity was arrived at, plus why it fell back.
 *
 * Carried a `Partial<Record<ExtractionField, Confidence>>` map until 2026-08-24. Nothing ever read
 * it: the only writer set every field to `'measured'`, the `'inferred'`/`'guessed'` arms were never
 * produced, and the "confidence badge in Review" it was documented as feeding was never built. The
 * comment on `deriveColorRoles` promising a Claude vision pass that would badge the accent
 * `inferred` is what kept it looking load-bearing.
 *
 * `fallback.reason` has no reader either and stays on purpose — it is written to the `report` jsonb,
 * where it is the only record of WHY a client ended up on the neutral default palette.
 */
export type ExtractionReport = {
  source: 'website' | 'fallback'
  fallback?: { reason: string }
}

/** What the extractor yields: a validated identity + how it was arrived at. */
export type ExtractionResult = { identity: VisualIdentity; report: ExtractionReport }

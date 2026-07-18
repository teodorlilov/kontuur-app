/**
 * Brand visual-identity domain types (Phase 1 foundation).
 *
 * Single source of truth for the shapes persisted in `brand_visual_identity` and returned by the
 * extraction pipeline. Internal pipeline types (ColorObservations, PageMeasurement, CaptureResult)
 * stay co-located in their modules — this file holds only the shared/persisted domain shapes.
 */

/** The five colour roles a kit is reduced to. `surface`/`ink` carry legible text; `accent` is the brand pop. */
export type ColorRole = 'surface' | 'ink' | 'accent' | 'accent-deep' | 'line'

/** A resolved brand palette, one hex per role. */
export type Palette = Record<ColorRole, string>

/** The four "vibe presets" (PRD §3) — the visual-language selector every downstream phase keys off. */
export type VibePresetId = 'luxury-minimalist' | 'modern-tech' | 'creative-edgy' | 'polished-photo'

/** How a stored identity was produced. */
export type SourceKind = 'default' | 'website' | 'manual'

/** The resolved typography pairing (family names, driven by the preset). */
export type Typography = { display_family: string; body_family: string }

/**
 * The art-direction brief vision infers from the brand — the persisted input to later image
 * generation (what to photograph, which motifs fit, and the overall mood).
 */
export type BrandBrief = { mood: string; photographicSubjects: string[]; motifs: string[] }

/** The full stored visual identity for a client. */
export type VisualIdentity = {
  palette: Palette
  typography: Typography
  vibe_preset: VibePresetId
  brief: BrandBrief
}

/** How a given extracted field was arrived at, surfaced as a confidence badge in Review. */
export type Confidence = 'measured' | 'inferred' | 'guessed'

export type ExtractionField = 'colors' | 'accent' | 'fonts' | 'typeScale' | 'mood' | 'subjects' | 'preset'

/** Per-field confidence map plus the preset recommendation and any soft-fallback reason. */
export type ExtractionReport = {
  source: 'website' | 'fallback'
  confidence: Partial<Record<ExtractionField, Confidence>>
  presetRecommendation?: { id: VibePresetId; reason: string }
  fallback?: { reason: string }
}

/** What the extractor yields: a validated identity + its confidence report. */
export type ExtractionResult = { identity: VisualIdentity; report: ExtractionReport }

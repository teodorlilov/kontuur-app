import type { Treatment } from '@/lib/scene-graph'

/**
 * The **art-direction spec** — the AI art director's per-brand output, and the shape a named preset also
 * takes (a preset is just a named `ArtDirection`). It holds **general brand *qualities*** (dimensions
 * every identity sits on) plus one **generation directive**; it deliberately contains **no named visual
 * devices** (no "torn", no motif enum). Distinctive decorative character is *generated* per brand from
 * `ornamentBrief`, never enumerated here. `resolveArtDirection` (renderer) turns this into the effective
 * layout pool + treatment + model routing that drives composition.
 */

type Formality = 'clinical' | 'corporate' | 'editorial' | 'expressive'
type ImageryApproach = 'photographic' | 'vector' | 'illustrative' | 'mixed' | 'minimal'
type Density = 'airy' | 'balanced' | 'dense'
type TypeCase = 'mixed' | 'upper'
type PaletteDiscipline = 'mono-accent' | 'multi'

export type ArtDirection = {
  /** Free text — the brand character; shown to the operator and folded into generation prompts. */
  personality: string
  formality: Formality
  imagery: ImageryApproach
  density: Density
  typeCase: TypeCase
  paletteDiscipline: PaletteDiscipline
  /** The finite photo-grade capability, chosen per brand (not a device — a grade). */
  treatment: Treatment
  /** Free text (from the brand's motifs/mood) → conditions the vector/pattern generators. The ONLY place
   *  decorative character lives, and it is *generated*, never a fixed enum. */
  ornamentBrief: string
}

/** A safe, clean, neutral direction — the fail-soft default (no key, bad LLM output, default kit). */
export const DEFAULT_ART_DIRECTION: ArtDirection = {
  personality: 'clean, modern, trustworthy',
  formality: 'corporate',
  imagery: 'photographic',
  density: 'balanced',
  typeCase: 'mixed',
  paletteDiscipline: 'mono-accent',
  treatment: 'tint',
  ornamentBrief: '',
}

const FORMALITY: readonly Formality[] = ['clinical', 'corporate', 'editorial', 'expressive']
const IMAGERY: readonly ImageryApproach[] = ['photographic', 'vector', 'illustrative', 'mixed', 'minimal']
const DENSITY: readonly Density[] = ['airy', 'balanced', 'dense']
const TYPE_CASE: readonly TypeCase[] = ['mixed', 'upper']
const PALETTE: readonly PaletteDiscipline[] = ['mono-accent', 'multi']
const TREATMENTS: readonly Treatment[] = ['none', 'duotone', 'tint', 'grain', 'mono', 'halftone']

const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback)

/**
 * Validate + clamp an untrusted spec (LLM output or a stored row) to the enums, falling back per-field to
 * the default. Guarantees a usable `ArtDirection` from any input — never throws.
 */
export function clampArtDirection(raw: unknown): ArtDirection {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    personality: text(r.personality, DEFAULT_ART_DIRECTION.personality),
    formality: oneOf(FORMALITY, r.formality, DEFAULT_ART_DIRECTION.formality),
    imagery: oneOf(IMAGERY, r.imagery, DEFAULT_ART_DIRECTION.imagery),
    density: oneOf(DENSITY, r.density, DEFAULT_ART_DIRECTION.density),
    typeCase: oneOf(TYPE_CASE, r.typeCase, DEFAULT_ART_DIRECTION.typeCase),
    paletteDiscipline: oneOf(PALETTE, r.paletteDiscipline, DEFAULT_ART_DIRECTION.paletteDiscipline),
    treatment: oneOf(TREATMENTS, r.treatment, DEFAULT_ART_DIRECTION.treatment),
    ornamentBrief: text(r.ornamentBrief, ''),
  }
}

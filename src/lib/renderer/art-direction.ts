import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import type { Treatment } from '@/lib/scene-graph'

/**
 * Turn an art direction into the effective composition parameters that drive a post: which layout **pool**
 * to draw from, and the photo **treatment** applied to every plate. Stage 1 maps the direction to the
 * closest preset style for the pool (reusing the archetype pools); Stage 2 replaces the mapping with
 * per-archetype trait scoring. Treatment comes straight from the spec, so a clinical brand's photos are
 * graded restrained (tint/none) and an expressive brand's are bold (duotone/halftone) — regardless of pool.
 */

/**
 * Map an art direction to the closest preset style slug (the layout language). `formality` + `imagery`
 * pick it: minimal → quiet-grid (no photos); vector/illustrative → illustrative; clinical → editorial when
 * photographic, else quiet-grid; expressive → bold-blocks; otherwise editorial.
 */
export function directionToStyleSlug(ad: ArtDirection): string {
  if (ad.imagery === 'minimal') return 'quiet-grid'
  if (ad.imagery === 'vector' || ad.imagery === 'illustrative') return 'illustrative'
  if (ad.formality === 'clinical') return ad.imagery === 'photographic' ? 'editorial' : 'quiet-grid'
  if (ad.formality === 'expressive') return 'bold-blocks'
  return 'editorial'
}

export type ResolvedDirection = {
  /** The preset style slug whose archetype pool this brand composes from. */
  styleSlug: string
  /** The photo grade applied to every plate (overrides the archetype's authored treatment). */
  treatment: Treatment
  /** The ornament directive that conditions generated brand marks. */
  ornamentBrief: string
}

export function resolveArtDirection(ad: ArtDirection): ResolvedDirection {
  return { styleSlug: directionToStyleSlug(ad), treatment: ad.treatment, ornamentBrief: ad.ornamentBrief }
}

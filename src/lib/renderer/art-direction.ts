import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import type { Treatment } from '@/lib/scene-graph'

/**
 * Turn an art direction into the per-brand levers that **condition** generation — no longer a layout pool.
 * The style (Editorial / Bold / Illustrative / Quiet grid) is the operator's choice; the art direction rides
 * on top of it, contributing (1) the photo **treatment** graded onto every generated plate, (2) an
 * **ornament** directive for editor-generated marks, and (3) a **conditioning phrase** folded into the design
 * prompt so a clinical brand reads restrained and an expressive one reads bold — regardless of style.
 */

const FORMALITY_PHRASE: Record<ArtDirection['formality'], string> = {
  clinical: 'clinical, precise and restrained',
  corporate: 'professional, polished and trustworthy',
  editorial: 'editorial, refined and considered',
  expressive: 'expressive, bold and characterful',
}

const DENSITY_PHRASE: Record<ArtDirection['density'], string> = {
  airy: 'with generous spacing and calm negative space',
  balanced: 'with balanced, comfortable spacing',
  dense: 'rich and layered',
}

const PALETTE_PHRASE: Record<ArtDirection['paletteDiscipline'], string> = {
  'mono-accent': 'a disciplined single-accent palette',
  multi: 'a full, confident use of the brand palette',
}

/** Compose the art-direction conditioning sentence folded into every design prompt for this brand. */
export function artDirectionConditioning(ad: ArtDirection): string {
  const personality = ad.personality.trim()
  return [
    FORMALITY_PHRASE[ad.formality],
    DENSITY_PHRASE[ad.density],
    `honouring ${PALETTE_PHRASE[ad.paletteDiscipline]}`,
    personality ? `overall feel: ${personality}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

export type ResolvedDirection = {
  /** The photo grade applied to every generated plate (overrides the style's default treatment). */
  treatment: Treatment
  /** The ornament directive that conditions editor-generated brand marks. */
  ornamentBrief: string
  /** The conditioning phrase folded into the design prompt. */
  conditioning: string
}

export function resolveArtDirection(ad: ArtDirection): ResolvedDirection {
  return { treatment: ad.treatment, ornamentBrief: ad.ornamentBrief, conditioning: artDirectionConditioning(ad) }
}

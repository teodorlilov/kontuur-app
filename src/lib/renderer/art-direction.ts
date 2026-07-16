import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import type { Treatment } from '@/lib/scene-graph'

/**
 * Turn an art direction into the per-brand levers that **condition** generation (the style is the operator's
 * choice). It contributes the photo `treatment` graded onto every plate, an `ornament` directive for editor
 * marks, and a `conditioning` phrase folded into the design prompt (clinical → restrained, expressive → bold).
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

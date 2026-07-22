/**
 * Brand-style registry — the scalable design systems a client can pick for AI visuals.
 *
 * Each style's `prompt` is injected verbatim as the STYLE paragraph of the image prompt. Prompts are
 * deliberately colour-free: the client's palette is the only colour source ("Use the palette as the
 * visual color foundation"). Adding a style = one entry here + one preview jpg in /public/brand-styles.
 */

export type BrandStyleId = 'graphic-editorial' | 'clinical-luxury'

export interface BrandStyle {
  id: BrandStyleId
  name: string
  /** One-line descriptor shown on the picker card. */
  description: string
  /** The STYLE paragraph injected verbatim into the image prompt. Never mentions colours. */
  prompt: string
  /** Public path of the portrait preview image shown on the picker card. */
  previewSrc: string
}

export const BRAND_STYLES: Record<BrandStyleId, BrandStyle> = {
  'graphic-editorial': {
    id: 'graphic-editorial',
    name: 'Graphic Editorial',
    description: 'Bold modernist magazine energy — expressive grids, collage, tactile print textures.',
    prompt:
      'Contemporary editorial graphic design, bold modernist social media campaign, experimental magazine art direction, anti-corporate Gen-Z branding aesthetic, high-contrast palette, oversized condensed bold sans-serif typography, elegant editorial serif typography as contrast, dramatic typographic hierarchy, asymmetrical modular grid, Swiss modernist influence, provocative visual manifesto, candid documentary photography, imperfect human moments, analog collage, subtle photocopy grain, paper texture, halftone printing artifacts, slightly distressed ink, geometric shapes, graphic blocks, editorial annotations, tiny captions, hand-drawn lines, aggressive image cropping, typography integrated directly into photography, sophisticated but rebellious, intelligent, playful, tactile, contemporary art direction, premium graphic design studio aesthetic, visually striking Instagram editorial poster.',
    previewSrc: '/brand-styles/graphic-editorial.jpg',
  },
  'clinical-luxury': {
    id: 'clinical-luxury',
    name: 'Clinical Luxury',
    description: 'Premium beauty-editorial calm — close-up photography, negative space, refined restraint.',
    prompt:
      'A premium luxury skincare editorial aesthetic combining high-end beauty photography, minimalist Swiss-inspired layouts, oversized bold sans-serif typography, elegant handwritten script accents, and refined editorial metadata. The visual language balances intimate close-up skin photography and tactile product imagery with generous negative space, soft muted backgrounds, subtle paper grain, and restrained graphic elements. The overall mood is sensual, clinical, sophisticated, modern, and aspirational, inspired by luxury cosmetics campaigns, fashion editorials, and premium beauty magazines.',
    previewSrc: '/brand-styles/clinical-luxury.jpg',
  },
}

export const BRAND_STYLE_IDS = Object.keys(BRAND_STYLES) as [BrandStyleId, ...BrandStyleId[]]

export const DEFAULT_BRAND_STYLE_ID: BrandStyleId = 'graphic-editorial'

/** Resolve a stored style id to its registry entry, falling back to the default for unknown/missing ids. */
export function getBrandStyle(id: string | undefined): BrandStyle {
  if (id && id in BRAND_STYLES) return BRAND_STYLES[id as BrandStyleId]
  return BRAND_STYLES[DEFAULT_BRAND_STYLE_ID]
}

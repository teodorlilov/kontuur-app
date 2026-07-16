import type { Treatment } from '@/lib/scene-graph'
import type { NegativeSpace } from '@/lib/images/prompt'

/**
 * A **style** (the enriched feed system — same DB slug, no new entity) is a **generation direction**: the
 * prompt scaffold that distinguishes the look, where the composited text sits, the default photo grade, and
 * the type-weight profile it needs loaded. Three styles are *generative* — a capable design model renders a
 * rich, text-free slide from the `scaffold` and we composite the brand text into `textZone`. One (`quiet-grid`)
 * is *compositor-only* — a plain brand colour ground + type, no model call, the clean zero-cost option.
 *
 * The pool/archetype machinery is gone: design variety now comes from the model, not hand-authored layouts.
 */
export type TextZone = NegativeSpace // 'bottom' | 'center' | 'top' — where the text block sits on the slide

export type Style = {
  slug: string
  name: string
  /** One-line character shown on the picker card. */
  character: string
  /** True → the design model renders the slide visual; false → compositor-only colour ground (quiet-grid). */
  generative: boolean
  /** The design-model prompt scaffold — the aesthetic directives that make this look distinct. */
  scaffold: string
  /** Where the composited brand text sits (and where generation reserves negative space). */
  textZone: TextZone
  /** The photo grade applied to a generated plate (the art direction can override it per brand). */
  treatment: Treatment
  /** Type weights this style renders with, so `kitFontsHref` loads them (no synthesized fallback). */
  weights: { display: number[]; body: number[] }
}

const EDITORIAL: Style = {
  slug: 'editorial',
  name: 'Editorial',
  character: 'Clean editorial photography under restrained serif type — generous whitespace.',
  generative: true,
  scaffold:
    'A clean, refined editorial magazine composition: elegant real photography, generous whitespace, ' +
    'understated and premium, soft natural light, restrained and sophisticated',
  textZone: 'bottom',
  treatment: 'none',
  weights: { display: [400, 600, 700], body: [400, 600] },
}

const BOLD_BLOCKS: Style = {
  slug: 'bold-blocks',
  name: 'Bold',
  character: 'High-contrast graphic poster — punchy colour blocks and heavy type.',
  generative: true,
  scaffold:
    'A bold, high-contrast graphic poster composition: strong solid colour blocks, punchy and geometric, ' +
    'dramatic directional light, confident and modern',
  textZone: 'center',
  treatment: 'none',
  weights: { display: [700, 800, 900], body: [700, 800] },
}

const ILLUSTRATIVE: Style = {
  slug: 'illustrative',
  name: 'Illustrative',
  character: 'Artistic collage and layered illustration — textured and expressive.',
  generative: true,
  scaffold:
    'An artistic, expressive collage composition: mixed-media, textured, layered illustration and cut-paper ' +
    'shapes, hand-crafted and characterful, rich and tactile',
  textZone: 'bottom',
  treatment: 'none',
  weights: { display: [500, 700, 800], body: [400, 500] },
}

// Quiet grid: no model call at all — a plain brand colour ground + clean type. The zero-cost, always-crisp
// option; distinguished from the others by `generative: false`.
const QUIET_GRID: Style = {
  slug: 'quiet-grid',
  name: 'Quiet Grid',
  character: 'Light type on a clean colour ground — calm, precise, no imagery.',
  generative: false,
  scaffold: '',
  textZone: 'center',
  treatment: 'none',
  weights: { display: [400, 500, 600], body: [300, 400, 500] },
}

const STYLES: Record<string, Style> = {
  editorial: EDITORIAL,
  'bold-blocks': BOLD_BLOCKS,
  'quiet-grid': QUIET_GRID,
  illustrative: ILLUSTRATIVE,
}

/** The style for a slug, falling back to editorial (the default) for unknown/null. */
export function getStyle(slug: string | null | undefined): Style {
  return (slug ? STYLES[slug] : undefined) ?? EDITORIAL
}

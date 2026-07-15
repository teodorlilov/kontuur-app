import type { Treatment } from '@/lib/scene-graph'

/**
 * A **style** (the enriched feed system — same DB slug, no new entity) is an art-direction bundle: the
 * pool of archetypes it draws from, the fal model routing per imagery kind (Phase B fills this), a default
 * photo treatment, and the type-weight profile it needs loaded. Compose samples layouts from `archetypes`;
 * `feedSystemTokens` reads `weights`. The pool mixes each style's own ported archetypes with the shared
 * no-photo graphic archetypes, so every style ships genuine layout variety.
 */
export type Style = {
  slug: string
  name: string
  /** One-line character shown on the picker card (Phase D). */
  character: string
  archetypes: string[]
  /** fal model ids per imagery kind — Phase B routes on these; empty = provider defaults. */
  imageModel: { photo?: string; vector?: string; illustration?: string }
  treatment: Treatment
  weights: { display: number[]; body: number[] }
}

const EDITORIAL: Style = {
  slug: 'editorial',
  name: 'Editorial',
  character: 'Serif display, wide margins, restraint — photography under type.',
  archetypes: ['editorial-cover', 'editorial-statement', 'editorial-list', 'editorial-quote', 'editorial-cta', 'annotated-type', 'stat'],
  imageModel: {},
  treatment: 'duotone',
  weights: { display: [400, 600, 700], body: [400, 600] },
}

const BOLD_BLOCKS: Style = {
  slug: 'bold-blocks',
  name: 'Bold Blocks',
  character: 'Heavy uppercase on solid colour blocks, maximum contrast, cutouts.',
  archetypes: ['bold-blocks-cover', 'bold-blocks-statement', 'bold-blocks-list', 'bold-blocks-quote', 'bold-blocks-cta', 'tile-grid', 'split', 'stat'],
  imageModel: {},
  treatment: 'duotone',
  weights: { display: [700, 800, 900], body: [700, 800] },
}

const QUIET_GRID: Style = {
  slug: 'quiet-grid',
  name: 'Quiet Grid',
  character: 'Light type on white, thin frames, generous whitespace — no photos.',
  archetypes: ['quiet-grid-cover', 'quiet-grid-statement', 'quiet-grid-list', 'quiet-grid-quote', 'quiet-grid-cta', 'annotated-type', 'tile-grid'],
  imageModel: {},
  treatment: 'tint',
  weights: { display: [400, 500, 600], body: [300, 400, 500] },
}

const STYLES: Record<string, Style> = {
  editorial: EDITORIAL,
  'bold-blocks': BOLD_BLOCKS,
  'quiet-grid': QUIET_GRID,
}

/** The style for a slug, falling back to editorial (the default) for unknown/null. */
export function getStyle(slug: string | null | undefined): Style {
  return (slug ? STYLES[slug] : undefined) ?? EDITORIAL
}

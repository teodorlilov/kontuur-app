import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { ensureLegibleColors } from '@/lib/brand-kit/extract/color-roles'
import { getArchetype, type Archetype } from './archetypes'
import { getStyle } from './styles'

/**
 * The feed-system **showcase** — a thin, registry-backed view used by the previews, the picker, and the
 * onboarding imagery seed. A style's showcase is its five canonical role compositions (cover/statement/
 * list/quote/cta), drawn straight from the archetype registry; the richer per-post variety lives in
 * `compose` (which samples the style's full archetype pool). The composition literals live once, in the
 * archetype modules — this file only maps and adapts.
 */

export type ReferenceRole = 'cover' | 'statement' | 'list' | 'quote' | 'cta'
const ROLE_ORDER: readonly ReferenceRole[] = ['cover', 'statement', 'list', 'quote', 'cta']

export type FeedSystemSlug = 'editorial' | 'bold-blocks' | 'quiet-grid'

function req(id: string): Composition {
  const a = getArchetype(id)
  if (!a) throw new Error(`feed-system showcase: archetype "${id}" not found`)
  return a.composition
}

function buildPack(slug: FeedSystemSlug): Record<ReferenceRole, Composition> {
  return ROLE_ORDER.reduce(
    (acc, role) => {
      acc[role] = req(`${slug}-${role}`)
      return acc
    },
    {} as Record<ReferenceRole, Composition>
  )
}

export const FEED_SYSTEM_PACKS: Record<FeedSystemSlug, Record<ReferenceRole, Composition>> = {
  editorial: buildPack('editorial'),
  'bold-blocks': buildPack('bold-blocks'),
  'quiet-grid': buildPack('quiet-grid'),
}

function isSlug(slug: string | null | undefined): slug is FeedSystemSlug {
  return slug === 'editorial' || slug === 'bold-blocks' || slug === 'quiet-grid'
}

/** The five showcase compositions for a feed system, unknown/absent falling back to editorial. */
export function feedSystemPack(slug: string | null | undefined): Record<ReferenceRole, Composition> {
  return isSlug(slug) ? FEED_SYSTEM_PACKS[slug] : FEED_SYSTEM_PACKS.editorial
}

/** The five showcase compositions in role order — the sequence the preview grid cycles. */
export function feedSystemCompositions(slug: string | null | undefined): Composition[] {
  const pack = feedSystemPack(slug)
  return ROLE_ORDER.map((role) => pack[role])
}

/**
 * A style's **archetype showcase** — its actual range of layouts (opener → content → closer), drawn from
 * the registry so it works for *every* style, including new ones like `illustrative` that have no 5-role
 * pack. This is what the picker filmstrip and the preview grid render, so a style's variety (and a
 * no-photo/vector style's true look) is visible rather than falling back to the editorial five.
 */
export function styleShowcase(slug: string | null | undefined): Archetype[] {
  const style = getStyle(slug)
  const resolved = style.archetypes.map(getArchetype).filter((a): a is Archetype => Boolean(a))
  const byKind = (k: Archetype['kind']) => resolved.filter((a) => a.kind === k)
  return [...byKind('opener'), ...byKind('content'), ...byKind('closer')]
}

/** Pick `n` evenly-spaced frames across a showcase — the filmstrip thumbnails for a picker card (opener …
 *  a content layout … closer), so a card shows the style's range at a glance rather than one cover. */
export function filmstripFrames(showcase: Archetype[], n = 3): Archetype[] {
  if (showcase.length <= n) return showcase
  return Array.from({ length: n }, (_, i) => showcase[Math.round((i * (showcase.length - 1)) / (n - 1))]!)
}

const mergeWeights = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])].sort((x, y) => x - y)

/**
 * The kit tokens a style renders with: same families, the weight arrays widened to cover the weights this
 * style's compositions ask for (so `kitFontsHref` loads them and no weight falls back to a synthesized
 * face), and the colours passed through `ensureLegibleColors` so a low-contrast extraction never renders
 * invisible text. The choke point every render surface funnels through, so the fix reaches stored kits
 * without a re-extraction. Weight profile lives on the style (`styles.ts`).
 */
export function feedSystemTokens(slug: string | null | undefined, tokens: BrandTokens): BrandTokens {
  const need = getStyle(slug).weights
  return {
    ...tokens,
    color: ensureLegibleColors(tokens.color),
    type: {
      ...tokens.type,
      display: { ...tokens.type.display, weights: mergeWeights(tokens.type.display.weights, need.display) },
      body: { ...tokens.type.body, weights: mergeWeights(tokens.type.body.weights, need.body) },
    },
  }
}

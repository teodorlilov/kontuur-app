/**
 * What makes one generated slide look different from the last one.
 *
 * Every axis is decided here so the image layer and the type layer cannot drift into disagreeing
 * about which variant a slide is. Nothing in here uses `Math.random()`: the visuals cron runs two
 * lanes over one carousel, and a random choice would let the same slide come back differently
 * depending on which lane reached it — the same class of bug `describePalette` fixed with
 * temperature 0.
 */

import { hashIndex } from '@/utils/hash-index'
import { slideRole } from './prompt'
import type { BrandStyle } from './brand-styles'

/** Identifies one *rendered* slide — the post it belongs to, where it sits, and which attempt this is. */
export interface VariationKey {
  /** The post id, or a draft id before the post exists. What keeps a carousel's slides related. */
  subject: string
  position: number
  total: number
  /**
   * Changes on every regenerate, empty on a first render.
   *
   * Empty is deliberate rather than incidental: it makes a first generation reproducible, so the
   * same post and position always produce the same composition until somebody asks for another one.
   */
  nonce: string
}

/**
 * Which of `count` variants this render takes. Stable per (post, position, attempt).
 *
 * `axis` names what is being chosen. Two axes asked without it would hash the same string and move
 * in lockstep — every close-crop would land on the same subject forever, which is a rotation of four
 * combinations dressed up as thirty-two.
 */
export function variantIndex(key: VariationKey, count: number, axis = ''): number {
  if (count <= 0) return 0
  return hashIndex(`${key.subject}:${key.position}:${key.nonce}:${axis}`, count)
}

/**
 * The art-direction sentence appended to the STYLE block, or null when this slide should not get one.
 *
 * It says how to SHOOT the picture, never what to put in it. That distinction is the whole design,
 * and it was learned the expensive way: this used to pick a subject archetype from a per-style list,
 * and because it landed as the last concrete sentence in the prompt it overrode the copy. A slide
 * reading "without this document the sale stops" came back as an aerial crowd. The subject is the
 * post's business; framing, light and staging are things you can say about any subject, so they add
 * variety without ever arguing with what the slide is about.
 *
 * Two axes rather than one because a single list of four gave four looks. Six framings × six
 * treatments is thirty-six, which is what a feed needs — and `variantIndex` is asked with a
 * different `axis` for each so they do not move in lockstep.
 *
 * The vocabulary comes from the STYLE, never from here. One shared list read as neutral and was not:
 * written while building Hyperreal Poster, it offered hard rim light and specular gloss to every
 * system, which is a poster brief handed to a negative-space skincare editorial.
 *
 * Silent on quiet middle slides and the closing call-to-action, because `slideRoleHint` already
 * spends those on restraint. That still holds with subjects gone: "framed extremely close,
 * overflowing the side edges" contradicts "most of the canvas plain calm background" just as
 * directly as a hero archetype did. Those slides vary through the type layer and the rich/quiet
 * rhythm they already had.
 */
export function artDirectionFor(key: VariationKey, style: BrandStyle): string | null {
  const role = slideRole(key.position, key.total)
  if (role !== 'cover' && role !== 'rich') return null

  const { framings, treatments } = style.variation
  if (framings.length === 0) return null

  const framing = framings[variantIndex(key, framings.length, 'framing')]
  const treatment =
    treatments.length > 0 ? treatments[variantIndex(key, treatments.length, 'treatment')] : null
  return `Shoot it this way for this slide: ${framing}${treatment ? `, ${treatment}` : ''}. The subject itself comes from the copy above.`
}

import type { CarouselSlide } from '@/types/api'

/** Single posts feed the whole caption into the prompt; clamp so one rambling caption can't bloat it. */
const CAPTION_MAX_CHARS = 500

const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu
const MENTION_PATTERN = /@[\p{L}\p{N}_.]+/gu

/** Strip URLs/#hashtags/@mentions (they invite glyph junk in generated images) and collapse whitespace. */
export function sanitizePromptText(text: string): string {
  return text
    .replace(URL_PATTERN, ' ')
    .replace(HASHTAG_PATTERN, ' ')
    .replace(MENTION_PATTERN, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

/** Clamp text at the last word boundary before `maxChars`, appending an ellipsis when cut. */
export function clampAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

// §6.1 visual hierarchy: an alternating rhythm — cover rich, then interior slides swing
// minimal/rich by parity (user decision 2026-07-24) so the carousel breathes instead of every
// slide being equally dense; the last slide always reads as a plain, structured CTA. Deliberately
// colour-free — the palette stays the only colour source. Wording is spatial and quantitative
// (ONE subject, named canvas zones): soft adjectives lose to the maximalist style paragraph, and
// the calm zones must match where text gets baked on EVERY slide (headline top, body lower half).
function slideRoleHint(position: number, total: number): string {
  if (position === 0) {
    return 'This is the cover slide: one bold dominant focal subject with maximum scroll-stopping impact — but keep the top quarter of the canvas calm and uncluttered, a large headline will be overlaid there.'
  }
  if (position === total - 1) {
    return 'This is the final call-to-action slide: one simple structured element on a mostly plain background with strong contrast — keep the top quarter and the lower half of the canvas calm and uncluttered, text will be overlaid there.'
  }
  if (position % 2 === 0) {
    return 'This is a richly detailed middle slide: embrace the full style with layered textures and elements around one strong focal subject — but keep the top quarter and the lower half of the canvas calm and uncluttered, text will be overlaid there.'
  }
  return 'This is a quiet middle slide: a restrained, minimal take on the style — ONE small supporting subject only, sparse elements, most of the canvas plain calm background; keep the top quarter and the lower half of the canvas calm and uncluttered, text will be overlaid there.'
}

/** TEXT block for one carousel slide; empty headline/body lines are omitted. Null when the slide has no copy. */
export function carouselSlideText(slide: CarouselSlide, position: number, total: number): string | null {
  const headline = sanitizePromptText(slide.headline ?? '')
  const body = sanitizePromptText(slide.body ?? '')
  if (!headline && !body) return null
  const lines = [
    ...(headline ? [`Headline: ${headline}`] : []),
    ...(body ? [`Body: ${body}`] : []),
  ]
  return `Slide ${position + 1} of ${total}\n${slideRoleHint(position, total)}\n\n${lines.join('\n')}`
}

/** TEXT block for a single-image post, built from its caption. Null when the caption is empty. */
export function singlePostText(caption: string | null): string | null {
  const sanitized = sanitizePromptText(caption ?? '')
  if (!sanitized) return null
  return `Single image post\n\n${clampAtWordBoundary(sanitized, CAPTION_MAX_CHARS)}`
}

/**
 * Derive the TEXT block for a persisted post at a position. Uses the actual slides array (upstream
 * generation may return a different count than requested). Null = invalid position or no usable copy.
 */
export function slideTextBlock(input: {
  postType: string
  slides: CarouselSlide[]
  caption: string | null
  position: number
}): string | null {
  const { postType, slides, caption, position } = input
  if (postType !== 'carousel') {
    return position === 0 ? singlePostText(caption) : null
  }
  const slide = slides[position]
  if (!slide) return null
  return carouselSlideText(slide, position, slides.length)
}

/**
 * The full gpt-image-2 prompt — the 3-variable contract (TEXT / COLOR PALETTE / STYLE) validated by hand.
 * Nothing else is ever injected; the closing instruction keeps images text-free and palette-grounded.
 */
export function buildVisualPrompt(input: {
  textBlock: string
  paletteDescription: string
  stylePrompt: string
}): string {
  return [
    'create a visual for social media for this slide',
    `TEXT - ${input.textBlock}`,
    '',
    'COLOR PALETTE',
    '',
    input.paletteDescription,
    '',
    'STYLE',
    '',
    input.stylePrompt,
    '',
    "Use the palette as the visual color foundation. Don't add text, just illustration relevant to the data the visual is for",
  ].join('\n')
}

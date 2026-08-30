/**
 * Brand-style registry — the scalable design systems a client can pick for AI visuals.
 *
 * Each style's `prompt` is injected verbatim as the STYLE paragraph of the image prompt. Prompts are
 * deliberately colour-free: the client's palette is the only colour source ("Use the palette as the
 * visual color foundation"). Adding a style = one entry here + one preview jpg in /public/brand-styles.
 */

import type { FontFamilyName } from '@/lib/canvas/font-library'
import type { SchemeSpec } from './color-scheme'

export type BrandStyleId = 'graphic-editorial' | 'clinical-luxury' | 'hyperreal-poster'

/** The style's typography pairing for text overlays (canvas editor + auto-compose seeding). */
export interface BrandStyleFonts {
  display: FontFamilyName
  body: FontFamilyName
  /** Seeded headlines are upper-cased when the style's signature is condensed caps. */
  headlineUppercase?: boolean
}

/**
 * The two families a CLIENT may choose, overriding their style's pairing.
 *
 * `headlineUppercase` is deliberately not here: whether a style sets its headlines in caps is a
 * signature of the design system, not a font choice, and letting it travel with the families would
 * mean picking a typeface silently changed the layout.
 */
export interface BrandFontChoice {
  display: FontFamilyName
  body: FontFamilyName
}

/**
 * The pairing an identity actually renders in — the client's choice over their style's default.
 *
 * ONE definition because six places ask: the seeder for each of its three text roles, the editor
 * for its lockup context and its preload list, and the lockup catalogue itself. Each of them used to
 * reach `getBrandStyle(identity.style).fonts` directly, which is correct only while nobody can
 * override it.
 *
 * Structurally typed rather than taking `VisualIdentity`, because `SeedIdentity` carries the same
 * two fields and both callers are equally entitled to an answer.
 */
export function fontsFor(identity: { style?: string; fonts?: BrandFontChoice }): BrandStyleFonts {
  return { ...getBrandStyle(identity.style).fonts, ...(identity.fonts ?? {}) }
}

/**
 * How much a style is allowed to vary between posts, and along which axes.
 *
 * Per style, because variability is a property of a design system rather than of the pipeline. The
 * first cut of this got it wrong: a flat campaign ground was forced onto EVERY style, which turned
 * Clinical Luxury — a system built on negative space and soft light — into slabs of solid navy, and
 * would have buried Graphic Editorial's collage under a saturated field it is meant to be laid over.
 *
 * So a style declares its own framings and treatments, and its own grounds. Only a system whose
 * whole premise is one flat colour behind one hero — Hyperreal Poster — reaches for the dark rungs.
 */
export interface BrandStyleVariation {
  /**
   * The ground/accent pairs this system may wear, named by rung on the client's tonal ladder.
   *
   * Per style, because a tone that suits one system wrecks another: Clinical Luxury is built on
   * negative space and a deep ground turns it into slabs, while Graphic Editorial needs a light
   * printed field for its collage to sit on. Naming rungs rather than hexes is what lets a style
   * express that without knowing anything about a particular client's colours.
   */
  schemes: readonly SchemeSpec[]
  /**
   * How this system USES the pair, as a sentence appended to the STYLE block.
   *
   * The same two colours are a flat backdrop to a poster, printed ink to an editorial, and a tint in
   * the lighting to a beauty shot. Treating the pair as "the background" everywhere is exactly the
   * mistake that put a navy slab behind a negative-space system.
   *
   * Written in the vocabulary of the style's OWN prompt — its paper and ink, its rim light, its
   * muted backdrop — so the two paragraphs narrow the same picture instead of describing two.
   *
   * One rule holds across all three: the pair governs the DESIGNED surfaces, never the photographed
   * subject. Each of these used to close on an absolute — "No third colour", "the only other colour
   * in the frame" — which gpt-image-2 correctly read as applying to the whole frame and answered
   * with a duotone. A documentary photograph rendered entirely in the brand's rust is not a brand
   * system; it is a photograph with the brand system printed over the top of it. The reference grids
   * settle it: full-colour panthers and real skin tones against saturated grounds.
   */
  colorDirective: (ground: string, accent: string) => string
  /**
   * How close the picture sits and where it falls in the frame. Colour-free, and SUBJECT-FREE.
   *
   * Subject-free is the whole point, and it is the correction of a real mistake. This used to be a
   * list of subject archetypes — a marble bust, a crowd seen from above, one wild animal — chosen by
   * the post's id hash and appended as the last concrete sentence of the prompt. It read as an
   * instruction and it beat the copy: a slide about the document that stops a property sale came
   * back as an aerial crowd, because "build the picture around a crowd" is specific and "illustration
   * relevant to the data" is not. The subject belongs to the post. Only the treatment rotates.
   *
   * Empty = no art direction for this style.
   */
  framings: readonly string[]
  /**
   * How the picture is HANDLED — the light, the staging, the layering — in this system's terms.
   *
   * A second axis because one list of four gave four looks. Framing × treatment multiplies, and both
   * are things you can say about any subject, so neither can contradict what the slide is about.
   */
  treatments: readonly string[]
}

export interface BrandStyle {
  id: BrandStyleId
  name: string
  /** One-line descriptor shown on the picker card. */
  description: string
  /** The STYLE paragraph injected verbatim into the image prompt. Never mentions colours. */
  prompt: string
  /** Public path of the portrait preview image shown on the picker card. */
  previewSrc: string
  fonts: BrandStyleFonts
  variation: BrandStyleVariation
}

export const BRAND_STYLES: Record<BrandStyleId, BrandStyle> = {
  'graphic-editorial': {
    id: 'graphic-editorial',
    name: 'Graphic Editorial',
    description:
      'Bold modernist magazine energy — expressive grids, collage, tactile print textures.',
    prompt:
      'Contemporary editorial graphic design, bold modernist social media campaign, experimental magazine art direction, anti-corporate Gen-Z branding aesthetic, high-contrast palette, oversized condensed bold sans-serif typography, elegant editorial serif typography as contrast, dramatic typographic hierarchy, asymmetrical modular grid, Swiss modernist influence, provocative visual manifesto, candid documentary photography, imperfect human moments, analog collage, subtle photocopy grain, paper texture, halftone printing artifacts, slightly distressed ink, geometric shapes, graphic blocks, editorial annotations, tiny captions, hand-drawn lines, aggressive image cropping, typography integrated directly into photography, sophisticated but rebellious, intelligent, playful, tactile, contemporary art direction, premium graphic design studio aesthetic, visually striking Instagram editorial poster.',
    previewSrc: '/brand-styles/graphic-editorial.jpg',
    // Dela Gothic One, not Oswald: the reference grid is set in a WIDE fat grotesque, and Oswald is
    // a condensed one that stops at 700 — so the heaviest headline this style could set was lighter
    // than its own preview. Measured, Dela Gothic One is 104% of Archivo Black's width and 99% of
    // its weight, which is the face that look actually comes from, and unlike Archivo Black it has
    // Cyrillic.
    fonts: { display: 'Dela Gothic One', body: 'Source Sans 3', headlineUppercase: true },
    // This system lays type and graphic blocks OVER a printed field, and a saturated backdrop leaves
    // the collage nothing to sit on. Its own reference is off-white paper with heavy type and one
    // accent — the variety comes from how the picture is cut and printed, not from repainting the
    // page and not from dictating what is photographed.
    variation: {
      // The page is NEVER coloured for this system. Twice now a tinted ground has been tried and
      // twice it swallowed the design: `light` (the brand hue at lightness 0.78) put a salmon field
      // behind a client's whole feed, and `tint` at 0.92 — a colour a swatch would call off-white —
      // did the same thing paler, because the model harmonises everything it paints TO the page it
      // is given. On a rust brand that means a rust page, rust blocks and a rust photograph: one
      // solid tile in the grid. This style's own reference is off-white paper throughout; all of its
      // variety is in the ink and the printing. So the ground is fixed and only the accent rotates.
      schemes: [
        ['paper', 'primary'],
        ['paper', 'shade'],
        ['paper', 'ink'],
        ['paper', 'secondary'],
      ],
      // "the halftone" used to be in the ink list, which was self-defeating: halftone is how a
      // PHOTOGRAPH is printed, so naming it as a thing the accent colours is an instruction to
      // duotone the picture — the exact outcome the closing sentence then asks against. The accent
      // gets the drawn and printed marks; the photograph is left alone.
      colorDirective: (ground, accent) =>
        `Print this on plain ${ground} paper stock — the page itself stays that colour and nothing else does. Use ${accent} for the printed marks only: the flat graphic blocks, the rules, the circled annotations. The photography is full-colour and untinted, laid on the page as it was shot.`,
      framings: [
        'cropped hard so it runs off two edges of the frame',
        'small against a large plain field of paper',
        'full bleed, filling the frame corner to corner',
        'halved — photograph on one side, flat tone on the other',
        'a tight detail crop that abstracts what is shown',
        'set low, with the upper half left as open paper',
      ],
      treatments: [
        'cut out and floated on the paper, a hand-drawn rule running past it',
        'torn and re-laid slightly out of register, like pasted-up artwork',
        'printed as a coarse halftone that bleeds off one edge',
        'straight photography with a rectangle of flat tone laid over one corner',
        'shot from below so it looms',
        'overprinted with thin editorial rules and tiny margin captions',
      ],
    },
  },
  'clinical-luxury': {
    id: 'clinical-luxury',
    name: 'Clinical Luxury',
    description:
      'Premium beauty-editorial calm — close-up photography, negative space, refined restraint.',
    prompt:
      'A premium luxury skincare editorial aesthetic combining high-end beauty photography, minimalist Swiss-inspired layouts, oversized bold sans-serif typography, elegant handwritten script accents, and refined editorial metadata. The visual language balances intimate close-up skin photography and tactile product imagery with generous negative space, soft muted backgrounds, subtle paper grain, and restrained graphic elements. The overall mood is sensual, clinical, sophisticated, modern, and aspirational, inspired by luxury cosmetics campaigns, fashion editorials, and premium beauty magazines.',
    previewSrc: '/brand-styles/clinical-luxury.jpg',
    // A SANS, not a serif. The reference grid — "THE SYSTEM", "NIACINAMIDE", "BARRIER IS BEAUTY" —
    // has no serif in it anywhere; Playfair Display was answering a brief this style never had.
    fonts: { display: 'Jost', body: 'Commissioner' },
    // Pale grounds only, emphatically: negative space IS this system. Forcing a flat saturated
    // colour behind every post replaced its soft, mostly-empty frames with slabs of solid colour and
    // undid the one quality it was chosen for.
    variation: {
      // The palest rungs only, and quiet accents. Negative space IS this system; anything deeper
      // than a tint reproduces the solid-slab regression that undid it once already.
      schemes: [
        ['paper', 'light'],
        ['tint', 'secondary'],
        ['paper', 'secondary'],
        ['tint', 'primary'],
      ],
      // "Never a solid block of colour" was doing real work — it is what stopped this system
      // becoming navy slabs — but it was aimed at the whole frame, including the style's own
      // "restrained graphic elements". With the grounds capped at paper and tint the backdrop is
      // soft by construction, so the restraint belongs on the accent, where the risk actually was.
      colorDirective: (ground, accent) =>
        `Set this against a soft muted ${ground} backdrop with generous negative space, and keep ${accent} restrained — a single graphic element, a shadow, or the cast of the light. Skin and product keep their own natural colour.`,
      framings: [
        'small in a wide field of empty space',
        'a tight macro crop that abstracts what is shown',
        'centred at mid distance with even margins',
        'set low in the frame, the space above left open',
        'held to one side, the rest of the frame left quiet',
        'cropped close at the top edge, falling away into space below',
      ],
      treatments: [
        'lit from one side so a long soft shadow crosses the frame',
        'shot straight down, laid flat on a plain surface',
        'seen through or reflected in a plain surface, slightly softened',
        'in diffused window light, edges left soft',
        'lit from behind so the light glows through it',
        'still and centred in even studio light, with fine grain over the whole frame',
      ],
    },
  },
  'hyperreal-poster': {
    id: 'hyperreal-poster',
    name: 'Hyperreal Poster',
    description:
      'One flat saturated ground, one hyperreal hero subject, oversized condensed caps — scroll-stopping covers.',
    // The reference grid this style was drawn from carries its headline, italic subline, wordmark
    // and domain footer INSIDE the picture. None of that belongs here: every prompt closes with
    // "Don't add text" and the lettering is the canvas editor's job. So what the style paragraph
    // buys is the ground the overlay lands on — a flat untextured field, one isolated subject, and
    // named empty margins that match the calm zones `slideRoleHint` reserves on every slide.
    prompt:
      'Bold contemporary poster art direction for a social media cover, one flat saturated single-hue backdrop drawn from the palette filling the entire frame, a single hero subject isolated and centre-framed against it, hyperreal photography with a surreal conceptual twist, glossy retouched surfaces, dramatic cinematic studio lighting, hard rim light and deep shadow falloff, extreme figure-to-ground separation, the subject cropped confidently by the frame edge, flat untextured ground with no gradient, no scenery, no props and no clutter, a generous uninterrupted margin held across the top of the frame and a calm unbroken band across the lower half, high colour saturation, punchy contrast, provocative and confident, editorial art direction meeting an advertising campaign key visual, premium creative studio aesthetic, scroll-stopping Instagram carousel cover.',
    // -v2, because a preview replaced in place keeps serving the old bytes: browsers and the image
    // CDN both key on the filename, and next/image rejects a `?v=` query on a local path (400).
    previewSrc: '/brand-styles/hyperreal-poster-v2.jpg',
    // Sofia Sans Condensed rather than the reference's Archivo Black, which serves weight 400 only:
    // `seedCanvasDoc` and the `stack` lockup both set headlines at 700, so that face would have been
    // asked for a weight it does not carry on EVERY headline, English ones included. This one is the
    // same heavy condensed-grotesque voice, carries 900, and is Cyrillic-verified like every other
    // pairing in the registry.
    // The EXTRA condensed cut: this reference is narrower than Graphic Editorial's, and using the
    // same face for both left the two styles setting type identically.
    fonts: { display: 'Sofia Sans Extra Condensed', body: 'Inter', headlineUppercase: true },
    // The ONE style that paints a ground, because one flat saturated colour behind one isolated hero
    // is not a variation of this system — it is the system. Everything else here inherits the
    // client's palette and leaves the picture's own background alone.
    variation: {
      // The full ladder: one flat saturated field behind one isolated hero is not a variation of this
      // system, it IS the system, so it is the one style that swings from paper to near-black.
      schemes: [
        ['primary', 'paper'],
        ['ink', 'primary'],
        ['secondary', 'tint'],
        ['shade', 'light'],
        ['tint', 'ink'],
        ['light', 'shade'],
        ['paper', 'ink'],
        ['primary', 'ink'],
      ],
      // The accent gets the RIM LIGHT, which is the style paragraph's own phrase — and what the
      // reference grid does: natural-coloured panthers, busts and astronauts against saturated
      // grounds, edged in a second colour. "The only other colour in the frame" asked for the
      // opposite and got a monochrome subject.
      colorDirective: (ground, accent) =>
        `Build this on a single flat ${ground} backdrop, edge to edge, with no gradient and no texture. Use ${accent} for the rim light and any flat graphic element. The hero subject keeps its own natural colour.`,
      framings: [
        'framed extremely close, overflowing the side edges',
        'framed at mid distance, with generous empty space held above it',
        'small and centred, dwarfed by the flat ground around it',
        'cropped by the bottom edge and rising into the frame',
        'held slightly off-centre, the flat ground open on one side',
        'seen from below so it towers over the viewer',
      ],
      treatments: [
        'lit hard from behind so a bright rim traces its whole edge',
        'caught mid-movement and frozen razor sharp',
        'wet and glossy, catching one hard specular highlight',
        'half in deep shadow, the falloff left unfilled',
        'lit top-down like a museum piece, casting one crisp shadow',
        'shot with a long lens so it reads flat and graphic against the ground',
      ],
    },
  },
}

export const BRAND_STYLE_IDS = Object.keys(BRAND_STYLES) as [BrandStyleId, ...BrandStyleId[]]

export const DEFAULT_BRAND_STYLE_ID: BrandStyleId = 'graphic-editorial'

/** Resolve a stored style id to its registry entry, falling back to the default for unknown/missing ids. */
export function getBrandStyle(id: string | undefined): BrandStyle {
  if (id && id in BRAND_STYLES) return BRAND_STYLES[id as BrandStyleId]
  return BRAND_STYLES[DEFAULT_BRAND_STYLE_ID]
}

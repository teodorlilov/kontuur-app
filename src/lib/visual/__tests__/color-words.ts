/**
 * The colour vocabulary prompt text is not allowed to use. Not a test itself — imported by the
 * specs that guard the two places prompt text is authored by hand.
 *
 * ONE definition, because the rule is one rule: the client's palette — through the tonal ladder
 * derived from it — is the only colour source, so any hue named in a style paragraph or in an
 * art-direction phrase is a colour the brand did not choose, competing with one it did. Two copies
 * would let a word be banned from the brand styles and allowed in the framings, which is exactly how
 * a "deep crimson" ends up overriding a client's green.
 */

/** Plain colour names. */
export const COLOR_WORDS = /yellow|black|white|blue|brown|cream|taupe|beige|neutral tones/i

/**
 * The saturated-hue vocabulary, added after a draft brand style hard-coded six backdrop colours
 * ("deep crimson, forest green, cobalt…") — a palette of its own. Boundaried, because these read as
 * substrings of innocent words (red/retouched, teal/metal, gold/golden).
 */
export const HUE_WORDS =
  /\b(crimson|scarlet|cobalt|indigo|violet|magenta|fuchsia|emerald|turquoise|teal|amber|ochre|olive|charcoal|silver|gold(?:en)?|pink|green|red|orange|purple|grey|gray)\b/i

/** Assert one authored prompt fragment names no colour. */
export function expectColorFree(text: string, label: string): void {
  for (const pattern of [COLOR_WORDS, HUE_WORDS]) {
    const hit = text.match(pattern)
    if (hit) throw new Error(`${label} names a colour: "${hit[0]}" in "${text}"`)
  }
}

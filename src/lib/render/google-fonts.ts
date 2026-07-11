import type { BrandTokens } from '@/lib/scene-graph'

/**
 * Build a Google Fonts CSS2 URL for a kit's display + body families with their merged weights,
 * `display=block` so nothing paints in a fallback. Cyrillic/Latin subsets are served automatically
 * by unicode-range. Phase 0 uses this in the render route; Task 2.5 swaps it for baked `@font-face`.
 */
export function googleFontsHref(tokens: BrandTokens): string {
  const families = new Map<string, Set<number>>()
  for (const face of [tokens.type.display, tokens.type.body]) {
    const weights = families.get(face.family) ?? new Set<number>()
    face.weights.forEach((weight) => weights.add(weight))
    families.set(face.family, weights)
  }
  const params = [...families.entries()].map(([family, weights]) => {
    const list = [...weights].sort((a, b) => a - b).join(';')
    return `family=${family.replace(/ /g, '+')}:wght@${list}`
  })
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=block`
}

import type { BrandTokens } from '@/lib/scene-graph'
import { isBakedFamily } from './font-library'

/**
 * Build a Google Fonts CSS2 URL for a kit's non-baked display + body families with their merged
 * weights, `display=block` so nothing paints in a fallback. Latin/Cyrillic subsets are served by
 * unicode-range. Baked families (self-hosted, see baked-fonts.css) are excluded; if both families are
 * baked — the Phase-0 default — there is nothing to fetch and this returns `null`.
 */
export function googleFontsHref(tokens: BrandTokens): string | null {
  const families = new Map<string, Set<number>>()
  for (const face of [tokens.type.display, tokens.type.body]) {
    if (isBakedFamily(face.family)) continue
    const weights = families.get(face.family) ?? new Set<number>()
    face.weights.forEach((weight) => weights.add(weight))
    families.set(face.family, weights)
  }
  if (families.size === 0) return null
  const params = [...families.entries()].map(([family, weights]) => {
    const list = [...weights].sort((a, b) => a - b).join(';')
    return `family=${family.replace(/ /g, '+')}:wght@${list}`
  })
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=block`
}

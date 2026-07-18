import type { BrandTokens } from '@/lib/scene-graph'

/**
 * Font URL for a kit's display + body families, all loaded from Google Fonts (latin/cyrillic subsets
 * via unicode-range). The single font path for every surface — the browser previews/editor and the
 * server render — so what you edit matches what exports. `display=swap` avoids a blank flash.
 */
export function kitFontsHref(tokens: BrandTokens): string {
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
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`
}

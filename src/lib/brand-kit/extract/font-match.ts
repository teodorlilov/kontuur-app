import { FONT_LIBRARY } from '@/lib/render/font-library'
import { proposeFamilies } from '@/lib/render/font-filter'
import { familyCategory } from './font-detect'

// CSS generic keywords and system-font aliases that carry no brand information — skipped so the
// matcher reads the site's *named* face, not "sans-serif" or "-apple-system".
const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|-apple-system|blinkmacsystemfont|inherit|initial|unset|revert|revert-layer|emoji|math|fangsong)$/i

/** The first *named* family in a CSS `font-family` stack (quotes stripped, generics skipped). */
export function primaryFamily(stack: string): string | null {
  for (const token of stack.split(',')) {
    const name = token.trim().replace(/^["']|["']$/g, '')
    if (name && !GENERIC.test(name)) return name
  }
  return null
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The library family whose name equals the measured face (ignoring case/spacing), or null. */
export function exactLibraryFamily(stack: string): string | null {
  const name = primaryFamily(stack)
  if (!name) return null
  const key = norm(name)
  return FONT_LIBRARY.find((entry) => norm(entry.family) === key)?.family ?? null
}

export type FamilyMatch = { family: string; exact: boolean }

/** Match one stack to a library family: the exact face if it's in the library, else the top family in
 *  its broad category. `exact` drives the extraction confidence badge. */
function matchOne(stack: string, fallback: string): FamilyMatch {
  const exact = exactLibraryFamily(stack)
  if (exact) return { family: exact, exact: true }
  return { family: proposeFamilies(familyCategory(stack))[0]?.family ?? fallback, exact: false }
}

/**
 * Map a site's measured heading/body stacks to concrete library families. Exact when the site's own
 * face is in the approved library (so a site set in Montserrat maps to Montserrat, not a generic sans);
 * otherwise the nearest family by category. When the two stacks name different faces but collapse to the
 * same category default, the body is nudged to a distinct family so display ≠ body (the old code always
 * returned the single top family for a category, which is why every sans site became Source Sans 3 twice).
 */
export function matchDisplayAndBody(
  headingStack: string,
  bodyStack: string,
  fallback: { display: string; body: string }
): { display: FamilyMatch; body: FamilyMatch } {
  const display = matchOne(headingStack, fallback.display)
  let body = matchOne(bodyStack, fallback.body)

  const stacksDiffer = norm(primaryFamily(headingStack) ?? '') !== norm(primaryFamily(bodyStack) ?? '')
  if (body.family === display.family && !body.exact && stacksDiffer) {
    const alt = proposeFamilies(familyCategory(bodyStack)).find((entry) => entry.family !== display.family)
    if (alt) body = { family: alt.family, exact: false }
  }
  return { display, body }
}

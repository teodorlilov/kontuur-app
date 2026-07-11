import { FONT_LIBRARY, type FontCategory, type FontEntry, type Subset } from './font-library'

/**
 * Map a client language (stored as a full name like "Bulgarian"/"English", or a code) to the writing
 * systems it needs. Bulgarian → Cyrillic; everything else defaults to Latin. Unknown languages get
 * Latin so the picker never empties.
 */
export function scriptsForLanguage(language: string | null | undefined): Subset[] {
  const key = (language ?? '').trim().toLowerCase()
  if (key.startsWith('bg') || key.startsWith('bul')) return ['cyrillic']
  if (key.startsWith('ru') || key.startsWith('uk') || key.startsWith('sr')) return ['cyrillic']
  return ['latin']
}

/** The union of scripts a client writes in, across primary and secondary languages (§3.2). */
export function requiredSubsets(primary: string | null | undefined, secondary?: string | null): Subset[] {
  const set = new Set<Subset>([...scriptsForLanguage(primary), ...scriptsForLanguage(secondary)])
  return [...set]
}

/** True when a family covers every required subset — the filter test, never a warning. */
export function familyCoversSubsets(entry: FontEntry, required: Subset[]): boolean {
  return required.every((subset) => entry.subsets.includes(subset))
}

/**
 * The families offered for a client's languages: only those covering every required script. A
 * bilingual client needs one family covering both scripts — this never pairs two (§3.2).
 */
export function filterFamiliesForLanguages(
  primary: string | null | undefined,
  secondary?: string | null
): FontEntry[] {
  const required = requiredSubsets(primary, secondary)
  return FONT_LIBRARY.filter((entry) => familyCoversSubsets(entry, required))
}

/**
 * Propose up to `count` families in a category — used by the image extractor (§2.2) to turn a vision
 * "font category" into concrete, Bulgarian-capable suggestions (badged `guessed`). Baked defaults
 * lead so a proposal always renders instantly.
 */
export function proposeFamilies(category: FontCategory, count = 3): FontEntry[] {
  const inCategory = FONT_LIBRARY.filter((entry) => entry.category === category)
  const ranked = [...inCategory].sort((a, b) => Number(b.baked) - Number(a.baked))
  return ranked.slice(0, count)
}

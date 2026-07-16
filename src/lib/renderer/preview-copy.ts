import type { Composition } from '@/lib/scene-graph'

/**
 * The sample preview compositions are authored with Bulgarian placeholder copy. For a non-Bulgarian client
 * we swap it to English so the live preview reads in their language. This is *preview-only* demo copy — real
 * posts inject their own text (see compose.ts). Keyed by the exact authored Bulgarian string.
 */
const PLACEHOLDER_EN: Record<string, string> = {
  'За социалните мрежи': 'On social media',
  'Съдържание, което\nхората помнят': 'Content that\npeople remember',
  'По-малко шум.\nПовече смисъл.': 'Less noise.\nMore meaning.',
  'Готови ли сте\nда започнем?': 'Ready to\nget started?',
  'Свържете се с нас →': 'Get in touch →',
}

/** Which placeholder language a client's configured language maps to. Bulgarian (or unset) keeps the
 *  authored Cyrillic copy; everything else uses English (the compositions never mix scripts). */
export function previewLocale(language: string | null | undefined): 'bg' | 'en' {
  const key = (language ?? '').trim().toLowerCase()
  if (!key || key.startsWith('bg') || key.startsWith('bul') || key.includes('bulgar')) return 'bg'
  return 'en'
}

/**
 * Localize a preview composition's placeholder text to the client's language. Bulgarian is the authored
 * default (returned unchanged); English swaps each recognised text layer's content. Unknown strings are
 * left as-is, so nothing ever renders empty.
 */
export function localizeComposition(composition: Composition, language: string | null | undefined): Composition {
  if (previewLocale(language) === 'bg') return composition
  return {
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.type !== 'text') return layer
      const en = PLACEHOLDER_EN[layer.content]
      return en !== undefined ? { ...layer, content: en, lang: 'en' } : layer
    }),
  }
}

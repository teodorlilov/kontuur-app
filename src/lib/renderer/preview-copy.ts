import type { Composition } from '@/lib/scene-graph'

/**
 * The preview compositions are authored with Bulgarian placeholder copy. For a non-Bulgarian client we
 * swap it to English so the live preview reads in their language. This is *preview-only* demo copy —
 * real posts inject their own text (see compose.ts). Keyed by the canonical mixed/title-case Bulgarian
 * string; the bold-blocks UPPERCASE variants are matched by comparing uppercased keys, so each message
 * is listed once.
 */
const PLACEHOLDER_EN: Record<string, string> = {
  'За социалните мрежи': 'On social media',
  'Съдържание, което\nхората помнят': 'Content that\npeople remember',
  'По-малко шум.\nПовече смисъл.': 'Less noise.\nMore meaning.',
  Стъпки: 'Steps',
  'Как започваме': 'How we begin',
  '01  Проучваме марката\n02  Събираме идеи\n03  Проектираме визия\n04  Публикуваме':
    '01  Research the brand\n02  Gather ideas\n03  Design the visuals\n04  Publish',
  'Дизайнът е\nмълчалив посланик.': 'Design is a\nsilent ambassador.',
  '— Пол Ранд': '— Paul Rand',
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

/** Translate one Bulgarian placeholder string to English — direct match, then an uppercase match so the
 *  bold-blocks UPPERCASE content resolves from the same canonical entry. */
function translate(content: string): string | undefined {
  const direct = PLACEHOLDER_EN[content]
  if (direct !== undefined) return direct
  for (const [bg, en] of Object.entries(PLACEHOLDER_EN)) {
    if (bg.toUpperCase() === content) return en.toUpperCase()
  }
  return undefined
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
      const en = translate(layer.content)
      return en !== undefined ? { ...layer, content: en, lang: 'en' } : layer
    }),
  }
}

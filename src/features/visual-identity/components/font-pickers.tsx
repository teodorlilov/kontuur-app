'use client'

import {
  fontOptions,
  languageNeedsCyrillic,
  type FontEntry,
  type FontFamilyName,
} from '@/lib/canvas/font-library'
import type { BrandFontChoice, BrandStyleFonts } from '@/lib/visual/brand-styles'

/**
 * Which tier of the library each slot may draw from.
 *
 * The real constraint is on BODY only: it is read at 26–44px, where a display face is the difference
 * between a caption and a decoration. A headline may be any of them — Clinical Luxury's own pairing
 * sets its display role in Jost, a sans, and restricting that slot to display+serif made a shipped
 * default unselectable in its own picker.
 *
 * Scripts are offered for neither. They are an accent face, and nothing in the seeder or the lockup
 * catalogue sets an accent role for one to land in.
 */
const SLOT_CATEGORIES: Record<keyof BrandFontChoice, FontEntry['category'][]> = {
  display: ['display', 'serif', 'sans'],
  body: ['sans', 'serif'],
}

const SLOT_LABELS: Record<keyof BrandFontChoice, string> = {
  display: 'Headline',
  body: 'Body',
}

/**
 * The faces offered for a slot, narrowed to the client's script — plus whatever is already selected.
 *
 * The filtering itself belongs to `fontOptions`, which the editor's layer dropdown also asks. This
 * only adds the slot's tiers and the alphabetical order a `<select>` wants; a client who picked a
 * Latin-only face and later switched to Bulgarian keeps seeing their real setting, marked.
 */
function optionsFor(
  slot: keyof BrandFontChoice,
  needsCyrillic: boolean,
  keep: FontFamilyName
): FontEntry[] {
  return fontOptions({
    requiresCyrillic: needsCyrillic,
    categories: SLOT_CATEGORIES[slot],
    keep,
  }).sort((a, b) => a.family.localeCompare(b.family))
}

/**
 * The client's type pairing, defaulting to their brand style's.
 *
 * `value` is what they have chosen and `fallback` is what the style would set — shown as the
 * selected option while nothing is stored, so the control always reflects what the posts will
 * actually use rather than sitting empty over a real setting.
 *
 * Families are marked rather than filtered when they carry no Cyrillic. Filtering would need the
 * client's language threaded down here, and the rule this codebase already follows is that script
 * support keys on the WORDS, not on the client — a Bulgarian client running an English campaign is
 * entitled to the Latin-only faces. The badge is what makes that an informed choice: Konva has no
 * fallback list, so Cyrillic set in a Latin-only face is substituted per glyph by the viewer's OS
 * and bakes that into the exported image.
 */
export function FontPickers({
  value,
  fallback,
  language,
  onChange,
}: {
  value: BrandFontChoice | undefined
  fallback: BrandStyleFonts
  /** The client's content language — narrows the list to faces that can actually set their copy. */
  language?: string
  onChange: (fonts: BrandFontChoice) => void
}) {
  const current: BrandFontChoice = value ?? { display: fallback.display, body: fallback.body }
  const needsCyrillic = languageNeedsCyrillic(language)

  return (
    <div className="grid max-w-[560px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
      {(['display', 'body'] as const).map((slot) => (
        <div key={slot} className="flex flex-col gap-1">
          {/* The specimen sits OUTSIDE the label. Inside it, its text joins the accessible name —
              the control stops being reachable as "Headline" and reads as the whole sentence. */}
          <label className="flex cursor-pointer flex-col gap-1">
            {/* tracking-normal: the Label role carries 0.16em, too loose above its own control. */}
            <span className="text-label font-medium uppercase tracking-normal text-text2">
              {SLOT_LABELS[slot]}
            </span>
            <select
              value={current[slot]}
              onChange={(event) =>
                onChange({ ...current, [slot]: event.target.value as FontFamilyName })
              }
              className="rounded-sm border border-line bg-paper px-2 py-1.5 text-micro text-ink"
            >
              {optionsFor(slot, needsCyrillic, current[slot]).map((entry) => (
                <option key={entry.family} value={entry.family}>
                  {entry.family}
                  {entry.cyrillic ? '' : ' — Latin only'}
                </option>
              ))}
            </select>
          </label>
          <span
            aria-hidden
            className="text-label text-text3"
            style={{ fontFamily: `"${current[slot]}", sans-serif` }}
          >
            Аа Bb — на кирилица и latin
          </span>
        </div>
      ))}
    </div>
  )
}

'use client'

import { AlertTriangle, ChevronDown } from 'lucide-react'
import { Listbox, type ListboxOption } from '@/components/ui/listbox'
import { cn } from '@/utils/cn'
import {
  availableFonts,
  getFontEntry,
  hasCyrillic,
  type FontCategory,
} from '@/lib/canvas/font-library'
import { EDITOR_CONTROL } from './chrome'

const CATEGORY_LABELS: Record<FontCategory, string> = {
  display: 'Display',
  serif: 'Serif',
  sans: 'Sans',
  script: 'Script',
}

interface FontListboxProps {
  value: string
  /** The layer's text — Cyrillic hides the Latin-only tier. */
  text: string
  onChange: (family: string) => void
}

/**
 * The font picker, on the app's one dropdown primitive. Each family is drawn in its own face, so a
 * font is chosen by how it looks rather than by reading its name; Latin-only families disappear for
 * Cyrillic text, and a family the doc already references stays selectable even when filtered out.
 */
export function FontListbox({ value, text, onChange }: FontListboxProps) {
  const cyrillic = hasCyrillic(text)
  const fonts = availableFonts(cyrillic)
  const known = getFontEntry(value)
  const listed = fonts.some((entry) => entry.family === value)
  const unsupported = cyrillic && known !== null && !known.cyrillic

  const options: ListboxOption[] = [
    ...(listed ? [] : [{ value, label: value, description: 'In this design' }]),
    ...(Object.keys(CATEGORY_LABELS) as FontCategory[]).flatMap((category) =>
      fonts
        .filter((entry) => entry.category === category)
        .map((entry) => ({
          value: entry.family,
          label: entry.family,
          description: CATEGORY_LABELS[category],
          leading: (
            <span
              aria-hidden
              className="text-title"
              style={{ fontFamily: `"${entry.family}", sans-serif` }}
            >
              Ag
            </span>
          ),
        }))
    ),
  ]

  // The warning rides on the trigger rather than sitting under it: this control lives in a 48px
  // toolbar row, where a second line would stretch the bar and be clipped.
  const warning = `No Cyrillic in ${value} — this text falls back to a system font.`

  return (
    <Listbox
      label="Font family"
      value={value}
      options={options}
      onChange={onChange}
      menuWidth="auto"
      renderTrigger={(selected, open) => (
        <button
          type="button"
          title={unsupported ? warning : 'Font family'}
          className={cn(
            EDITOR_CONTROL,
            'flex w-[150px] cursor-pointer items-center justify-between gap-2',
            unsupported && 'border-danger',
            open && 'border-spring'
          )}
        >
          <span
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontFamily: `"${selected?.label ?? value}", sans-serif` }}
          >
            {selected?.label ?? value}
          </span>
          {unsupported && <AlertTriangle size={13} className="shrink-0 text-danger" aria-hidden />}
          <ChevronDown size={13} className="shrink-0 text-text3" aria-hidden />
        </button>
      )}
    />
  )
}

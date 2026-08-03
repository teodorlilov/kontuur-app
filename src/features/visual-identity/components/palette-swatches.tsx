'use client'

import type { ColorRole, Palette } from '@/types/visual'

// Role → the PRD's plain-language label shown to non-technical users.
const ROLE_LABELS: Record<ColorRole, string> = {
  surface: 'Background',
  ink: 'Text',
  accent: 'Primary',
  'accent-deep': 'Secondary',
  line: 'Dividers',
}

const ROLE_ORDER: ColorRole[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']

/** Editable palette: one role-labelled colour input per brand colour. */
export function PaletteSwatches({
  palette,
  onChange,
}: {
  palette: Palette
  onChange: (palette: Palette) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2.5">
      {ROLE_ORDER.map((role) => (
        <label key={role} className="flex cursor-pointer flex-col gap-1">
          {/* tracking-normal: the Label role carries 0.16em, which is too loose for a word
              this short sitting directly above its own control. */}
          <span className="text-label font-medium uppercase tracking-normal text-text2">
            {ROLE_LABELS[role]}
          </span>
          <span className="flex items-center gap-2 rounded-sm border border-line bg-paper px-2 py-1">
            <input
              type="color"
              value={palette[role]}
              onChange={(event) =>
                onChange({ ...palette, [role]: event.target.value.toUpperCase() })
              }
              className="size-[22px] cursor-pointer rounded-xs border-none bg-none p-0"
            />
            <span className="text-micro tabular-nums text-ink">{palette[role]}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

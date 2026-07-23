'use client'

import { availableFonts, getFontEntry, hasCyrillic, type FontCategory } from '@/lib/canvas/font-library'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

const CATEGORY_LABELS: Record<FontCategory, string> = {
  display: 'Display',
  serif: 'Serif',
  sans: 'Sans',
  script: 'Script',
}

interface FontSelectProps {
  value: string
  /** The layer's text — Cyrillic hides the Latin-only tier. */
  text: string
  onChange: (family: string) => void
}

/** Grouped font picker; Latin-only families disappear for Cyrillic text, unknown fonts stay listed. */
export function FontSelect({ value, text, onChange }: FontSelectProps) {
  const cyrillic = hasCyrillic(text)
  const fonts = availableFonts(cyrillic)
  const known = getFontEntry(value)
  const currentEntry = fonts.find((entry) => entry.family === value)
  const currentUnsupported = cyrillic && known !== null && !known.cyrillic

  return (
    <div>
      <div style={PANEL_LABEL}>Font</div>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={PANEL_CONTROL}>
        {/* A doc can reference a font outside the offered list (unknown or Cyrillic-filtered); keep it selectable. */}
        {!currentEntry && <option value={value}>{value}</option>}
        {(Object.keys(CATEGORY_LABELS) as FontCategory[]).map((category) => (
          <optgroup key={category} label={CATEGORY_LABELS[category]}>
            {fonts
              .filter((entry) => entry.category === category)
              .map((entry) => (
                <option key={entry.family} value={entry.family}>
                  {entry.family}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {currentUnsupported && (
        <p style={{ fontSize: '10px', color: 'var(--color-error-fg)', margin: '6px 0 0', lineHeight: 1.4 }}>
          {value} has no Cyrillic support — this text will render in a system font.
        </p>
      )}
    </div>
  )
}

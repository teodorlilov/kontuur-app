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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: '10px' }}>
      {ROLE_ORDER.map((role) => (
        <label key={role} style={{ display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 500,
              color: 'var(--color-muted)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            {ROLE_LABELS[role]}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              border: '0.5px solid var(--color-border-1)',
              borderRadius: '8px',
              padding: '5px 7px',
              background: 'var(--color-page)',
            }}
          >
            <input
              type="color"
              value={palette[role]}
              onChange={(e) => onChange({ ...palette, [role]: e.target.value.toUpperCase() })}
              style={{
                width: '22px',
                height: '22px',
                border: 'none',
                borderRadius: '5px',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-text-1)', fontVariantNumeric: 'tabular-nums' }}>
              {palette[role]}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

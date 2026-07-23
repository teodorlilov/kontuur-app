'use client'

import type { Palette } from '@/types/visual'
import { PANEL_LABEL } from './panel-styles'

interface ColorSwatchesProps {
  label: string
  palette: Palette
  value: string
  onChange: (hex: string) => void
}

/** One-click brand-palette swatches plus a free colour input. */
export function ColorSwatches({ label, palette, value, onChange }: ColorSwatchesProps) {
  const roles = Object.entries(palette) as Array<[string, string]>
  return (
    <div>
      <div style={PANEL_LABEL}>{label}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {roles.map(([role, hex]) => (
          <button
            key={role}
            type="button"
            title={role}
            onClick={() => onChange(hex)}
            style={{
              width: 24,
              height: 24,
              borderRadius: '6px',
              background: hex,
              cursor: 'pointer',
              border:
                value.toLowerCase() === hex.toLowerCase()
                  ? '2px solid var(--color-terracotta)'
                  : '0.5px solid var(--color-border-2)',
            }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          title="Custom colour"
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
        />
      </div>
    </div>
  )
}

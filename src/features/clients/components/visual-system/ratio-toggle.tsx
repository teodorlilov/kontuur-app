'use client'

import { ASPECT_RATIOS, type AspectRatio } from '@/lib/renderer/layout/anchor'

/** The aspect-ratio switch for the live preview (4:5 / 1:1). Preview-only — ratio is a per-post choice
 *  at generation, not part of the saved kit. Shared by the settings tab and the onboarding Review. */
export function RatioToggle({ value, onChange }: { value: AspectRatio; onChange: (ratio: AspectRatio) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {ASPECT_RATIOS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '3px 7px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            border: r === value ? '1px solid var(--color-terracotta)' : '0.5px solid var(--color-border-1)',
            background: r === value ? 'var(--color-terracotta)' : 'transparent',
            color: r === value ? '#fff' : 'var(--color-text-2)',
          }}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

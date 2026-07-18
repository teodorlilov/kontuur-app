'use client'

import type { VibePresetId } from '@/types/visual'
import { VIBE_PRESETS, VIBE_PRESET_IDS } from '@/lib/visual/vibe-presets'

/** Four selectable vibe-preset cards. Selecting one is the brand's visual-language choice. */
export function VibePresetPicker({
  selected,
  onSelect,
}: {
  selected: VibePresetId
  onSelect: (id: VibePresetId) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
      {VIBE_PRESET_IDS.map((id) => {
        const preset = VIBE_PRESETS[id]
        const isActive = id === selected
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              background: isActive ? 'rgba(192,123,85,0.08)' : 'var(--color-page)',
              border: isActive
                ? '1px solid var(--color-terracotta)'
                : '0.5px solid var(--color-border-1)',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {(['surface', 'ink', 'accent', 'accent-deep'] as const).map((role) => (
                <span
                  key={role}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    background: preset.defaultPalette[role],
                    border: '0.5px solid rgba(0,0,0,0.08)',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: '2px' }}>
              {preset.uiLabel}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-2)', lineHeight: 1.4 }}>
              {preset.targetClients}
            </div>
          </button>
        )
      })}
    </div>
  )
}

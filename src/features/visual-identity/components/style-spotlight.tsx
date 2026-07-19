'use client'

import type { Palette, VibePresetId } from '@/types/visual'
import { VIBE_PRESETS, VIBE_PRESET_IDS, getVibePreset } from '@/lib/visual/vibe-presets'
import { FONT_REGISTRY, fontFamilyStack, getFont, googleFontsHref, type FontKey } from '@/lib/visual/fonts'
import { StyleBackdrop } from './style-backdrop'

const ALL_FONT_KEYS = Object.keys(FONT_REGISTRY) as FontKey[]

/**
 * Single "style spotlight": pick one of the four presets via name pills and preview it as a mock 4:5
 * carousel slide in the brand's own colours + that preset's fonts. The backdrop is the fal.ai seam
 * (`StyleBackdrop`). Colours come from the shared Brand Palette (the single editable source), so the
 * spotlight updates live as the palette is edited. Presets choose the look, not the colours.
 */
export function StyleSpotlight({
  selected,
  onSelect,
  palette,
}: {
  selected: VibePresetId
  onSelect: (id: VibePresetId) => void
  palette: Palette
}) {
  const preset = getVibePreset(selected)
  const displayStack = fontFamilyStack(preset.fontPairing.display)
  const bodyStack = fontFamilyStack(preset.fontPairing.body)

  return (
    <div>
      {/* React 19 hoists + dedupes; loads every preset's faces so switching is instant. */}
      <link rel="stylesheet" href={googleFontsHref(ALL_FONT_KEYS)} />

      {/* Switcher */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {VIBE_PRESET_IDS.map((id) => {
          const isActive = id === selected
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                background: isActive ? 'var(--color-terracotta)' : 'var(--color-page)',
                color: isActive ? '#fff' : 'var(--color-text-2)',
                border: isActive ? '1px solid var(--color-terracotta)' : '0.5px solid var(--color-border-1)',
                transition: 'all 0.15s',
              }}
            >
              {VIBE_PRESETS[id].uiLabel}
            </button>
          )
        })}
      </div>

      {/* Spotlight: mock slide + meta */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ width: '200px', flexShrink: 0 }}>
          <StyleBackdrop palette={palette}>
            {/* A mock carousel slide that exercises every palette role so editing any swatch shows an
                effect: surface (backdrop), accent-deep (mark), ink (type), accent (rule), line (footer). */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: palette['accent-deep'] }} />
              <div>
                <div style={{ fontFamily: displayStack, color: palette.ink, fontSize: '22px', lineHeight: 1.05 }}>
                  {preset.uiLabel}
                </div>
                <div style={{ width: '32px', height: '3px', borderRadius: '2px', background: palette.accent, margin: '8px 0' }} />
                <div style={{ fontFamily: bodyStack, color: palette.ink, opacity: 0.72, fontSize: '11px', lineHeight: 1.35 }}>
                  The quick brown fox jumps over the lazy dog.
                </div>
              </div>
              <div>
                <div style={{ height: '1px', background: palette.line, marginBottom: '6px' }} />
                <div style={{ fontFamily: bodyStack, color: palette.ink, opacity: 0.5, fontSize: '9px' }}>@yourbrand · 1 / 5</div>
              </div>
            </div>
          </StyleBackdrop>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-1)' }}>{preset.uiLabel}</div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-2)', lineHeight: 1.5, margin: '6px 0 12px' }}>
            {preset.description}
          </p>
          <MetaRow label="Best for" value={preset.targetClients} />
          <MetaRow
            label="Fonts"
            value={`${getFont(preset.fontPairing.display).family} · ${getFont(preset.fontPairing.body).family}`}
          />
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          marginBottom: '2px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-1)', lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}

'use client'

import type { VibePresetId } from '@/types/visual'
import { getVibePreset } from '@/lib/visual/vibe-presets'
import { fontFamilyStack, getFont, googleFontsHref } from '@/lib/visual/fonts'

/**
 * Read-only preview of a preset's typography pairing, rendered in the real typefaces (loaded from
 * Google Fonts). The pairing is preset-driven and authoritative, so it follows the selected preset.
 */
export function FontPairingPreview({ presetId }: { presetId: VibePresetId }) {
  const { display, body } = getVibePreset(presetId).fontPairing
  const displayFont = getFont(display)
  const bodyFont = getFont(body)

  return (
    <div>
      {/* React 19 hoists and dedupes this stylesheet link into <head>. */}
      <link rel="stylesheet" href={googleFontsHref([display, body])} />
      <div
        style={{
          border: '0.5px solid var(--color-border-1)',
          borderRadius: '10px',
          padding: '14px 16px',
          background: 'var(--color-page)',
        }}
      >
        <div style={{ fontFamily: fontFamilyStack(display), fontSize: '26px', color: 'var(--color-text-1)', lineHeight: 1.1 }}>
          {displayFont.family}
        </div>
        <div style={{ fontFamily: fontFamilyStack(body), fontSize: '13px', color: 'var(--color-text-2)', marginTop: '6px' }}>
          {bodyFont.family} — the quick brown fox jumps over the lazy dog.
        </div>
      </div>
    </div>
  )
}

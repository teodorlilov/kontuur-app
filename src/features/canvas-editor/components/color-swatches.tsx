'use client'

import { useState } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Palette } from '@/types/visual'
import { EDITOR_LABEL } from './workspace/chrome'

const HEX = /^#[0-9a-fA-F]{6}$/

interface ColorSwatchesProps {
  label: string
  palette: Palette
  value: string
  onChange: (hex: string) => void
  /**
   * A control that belongs in the swatch row but is not a colour — an "off" chip, say. Passed in
   * rather than built here because only some colours can be absent, and a row that always offered
   * "none" would be lying about the ones that cannot.
   */
  leading?: React.ReactNode
}

/** One-click brand-palette swatches, a free colour input, a hex field and the screen eyedropper. */
export function ColorSwatches({ label, palette, value, onChange, leading }: ColorSwatchesProps) {
  const roles = Object.entries(palette) as Array<[string, string]>
  // While typing, the field holds a half-finished hex of its own; null hands it back to whatever
  // the colour actually is, so swatch clicks and the picker show up here without any syncing.
  const [draft, setDraft] = useState<string | null>(null)

  const editDraft = (next: string) => {
    const candidate = next.startsWith('#') ? next : `#${next}`
    setDraft(candidate)
    if (HEX.test(candidate)) onChange(candidate.toLowerCase())
  }

  return (
    <div>
      <div className={EDITOR_LABEL}>{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {leading}
        {roles.map(([role, hex]) => (
          <button
            key={role}
            type="button"
            title={role}
            aria-label={role}
            aria-pressed={value.toLowerCase() === hex.toLowerCase()}
            onClick={() => onChange(hex)}
            className={cn(
              'size-6 cursor-pointer rounded-xs',
              value.toLowerCase() === hex.toLowerCase()
                ? 'border-2 border-forest'
                : 'border border-line2'
            )}
            // The swatch IS the palette entry — the one thing here a class cannot carry.
            style={{ background: hex }}
          />
        ))}
        <input
          type="color"
          value={HEX.test(value) ? value : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          title="Custom colour"
          aria-label="Custom colour"
          className="size-7 cursor-pointer border-none bg-transparent p-0"
        />
        <EyedropperButton onPick={onChange} />
        <input
          type="text"
          value={draft ?? value}
          spellCheck={false}
          aria-label={`${label} hex value`}
          onChange={(event) => editDraft(event.target.value)}
          onBlur={() => setDraft(null)}
          className="w-[86px] rounded-xs border border-line2 bg-paper px-1.5 py-1 font-sans text-caption text-ink tabular-nums"
        />
      </div>
    </div>
  )
}

/**
 * Sample any pixel on screen. Chromium-only, so the control simply is not offered elsewhere
 * rather than appearing and failing.
 */
function EyedropperButton({ onPick }: { onPick: (hex: string) => void }) {
  // Safe to read at first render: the whole editor is loaded with ssr:false, so there is no
  // server pass to mismatch against.
  const [supported] = useState(() => typeof window !== 'undefined' && 'EyeDropper' in window)
  if (!supported) return null

  return (
    <button
      type="button"
      title="Pick a colour from the screen"
      onClick={() => {
        void new EyeDropper()
          .open()
          .then((result) => onPick(result.sRGBHex))
          // The user pressing Escape rejects the promise; that is a cancel, not a failure.
          .catch(() => undefined)
      }}
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-xs border border-line2 bg-paper text-text2 hover:text-ink"
    >
      <Pipette size={13} aria-hidden />
    </button>
  )
}

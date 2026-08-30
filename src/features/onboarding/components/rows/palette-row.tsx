'use client'

import { PaletteSwatches } from '@/features/visual-identity/components/palette-swatches'
import {
  EXTRACTION_HINT,
  type ExtractionStatus,
} from '@/features/onboarding/hooks/use-extraction-status'
import type { Palette } from '@/types/visual'

const ROLE_ORDER: (keyof Palette)[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']

/**
 * The measured brand palette, read back as five swatches.
 *
 * These are the client's *own* colours, which is why they appear as content and never as chrome —
 * DESIGN.md is explicit that a brand hex pulled from a website must not tint a button, an avatar
 * or a surface. A swatch row is exactly where it belongs.
 */
export function PaletteRead({
  palette,
  status = 'idle',
}: {
  palette: Palette
  status?: ExtractionStatus
}) {
  // While the read is in flight the row shows that it is waiting, rather than showing defaults
  // that will silently change under the user a few seconds later.
  if (status === 'pending') {
    return (
      <>
        <span aria-hidden className="inline-flex flex-none gap-1.5">
          {ROLE_ORDER.map((role) => (
            <span key={role} className="skeleton size-7 rounded-sm" />
          ))}
        </span>
        <span className="flex-none text-micro text-text3">reading the site&rsquo;s colours…</span>
      </>
    )
  }

  return (
    <>
      <span aria-hidden className="inline-flex flex-none gap-1.5">
        {ROLE_ORDER.map((role) => (
          <span
            key={role}
            className="size-7 rounded-sm border border-line2"
            // The colour under review — a computed value, not a token.
            style={{ background: palette[role] }}
          />
        ))}
      </span>
      <span className="sr-only">
        Brand palette: {ROLE_ORDER.map((role) => `${role} ${palette[role]}`).join(', ')}.
      </span>
    </>
  )
}

export function PaletteEdit({
  palette,
  status = 'idle',
  onChange,
}: {
  palette: Palette
  status?: ExtractionStatus
  onChange: (palette: Palette) => void
}) {
  const hint = EXTRACTION_HINT[status]

  return (
    <div className="w-full">
      {hint && <p className="mb-2 text-micro leading-relaxed text-text2">{hint}</p>}
      <PaletteSwatches palette={palette} onChange={onChange} />
    </div>
  )
}

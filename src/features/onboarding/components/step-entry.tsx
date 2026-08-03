'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CONTROL_FOCUS_WITHIN } from '@/components/ui/form/control-classes'
import { cn } from '@/utils/cn'
import { toHostLabel, toWebsiteUrl } from '@/utils/url'

interface StepEntryProps {
  /** The full URL. The field shows only the host — see the note on the input below. */
  websiteUrl: string
  onWebsiteUrlChange: (value: string) => void
  onAnalyze: () => void
  onSkip: () => void
  analyzing?: boolean
}

/**
 * One question on a surface with nothing competing for the eye.
 *
 * Prompt over Lead, the pairing features/auth/components/auth-layout.tsx uses. The field is Lead
 * at every width rather than the usual body-at-md: it is the entire subject of the view, and Lead
 * is a ramp step rather than an escape from one — which also satisfies the Mobile Input Exemption
 * without a breakpoint.
 */
export function StepEntry({
  websiteUrl,
  onWebsiteUrlChange,
  onAnalyze,
  onSkip,
  analyzing = false,
}: StepEntryProps) {
  // The field holds exactly what was typed. Rendering `toHostLabel(websiteUrl)` instead made the
  // display a lossy round trip: a typed "/" is trailing for one keystroke, `toHostLabel` strips it,
  // and the next character lands where the slash should be — "acme.com/about" became
  // "acme.comabout". The parent keeps the normalised URL; this is only the input buffer.
  const [typed, setTyped] = useState(() => toHostLabel(websiteUrl))
  const hasInput = typed.trim() !== ''

  return (
    <div className="mx-auto mt-[12vh] w-full max-w-[520px] px-4 text-center">
      <h1 className="text-balance font-display text-prompt font-normal text-ink">Add a client</h1>
      <p className="mt-3 text-lead text-text2">
        Paste their website. Kontuur reads it and drafts the whole profile — name, audience, tone,
        content mix, brand colours. You check what it couldn&rsquo;t work out.
      </p>

      <div
        className={cn(
          'mt-8 flex items-center gap-2 rounded-lg border border-line2 bg-surface py-1 pl-4 pr-1',
          'transition-[border-color,box-shadow] duration-150 ease-contour hover:border-text3/45',
          CONTROL_FOCUS_WITHIN
        )}
      >
        <span className="flex-none text-lead text-text3">https://</span>
        <input
          // The scheme is added here, at the one place a person types a URL. Holding a bare host
          // in state and normalising at each call site is what broke the site read, source
          // discovery and then the sources stepper — three failures, one missing `https://`, and
          // a fourth call site always waiting to be missed.
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            onWebsiteUrlChange(toWebsiteUrl(event.target.value))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && hasInput) onAnalyze()
          }}
          placeholder="acmestudio.com"
          autoComplete="off"
          aria-label="Client website"
          className="min-w-0 flex-1 border-none bg-transparent py-2 text-lead text-ink outline-none placeholder:text-text3"
        />
        <Button onClick={onAnalyze} disabled={!hasInput} loading={analyzing} className="flex-none">
          Read the site →
        </Button>
      </div>

      <p className="mt-4 text-caption text-text3">
        No website?{' '}
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            '-mx-2 -my-1 rounded-xs px-2 py-1 text-caption font-medium text-spring-text',
            'transition-colors duration-150 ease-contour hover:bg-wash hover:text-forest',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
          )}
        >
          Set them up by hand
        </button>
      </p>
    </div>
  )
}

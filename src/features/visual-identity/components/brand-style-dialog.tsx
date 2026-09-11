'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Check, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import {
  CONTROL_FOCUS_WITHIN,
  CONTROL_SURFACE,
  CONTROL_TEXT,
  FOCUS_RING,
} from '@/components/ui/form/control-classes'
import { focusableItems, rovingFocus } from '@/components/ui/roving-focus'
import {
  BRAND_STYLES,
  BRAND_STYLE_IDS,
  getBrandStyle,
  type BrandStyle,
  type BrandStyleId,
} from '@/lib/visual/brand-styles'

interface BrandStyleDialogProps {
  /** What the client is on now: where the preview starts, and what cancelling returns to. */
  current: BrandStyleId
  onConfirm: (style: BrandStyleId) => void
  onClose: () => void
}

/**
 * The brand-style browser — the whole catalogue in a scrolling list, one of them shown large beside
 * it. Previewing is not choosing: a row click only moves the preview, and nothing leaves here until
 * the confirm button is pressed.
 *
 * Takes no `open` prop, and that is load-bearing rather than an oversight. `Modal` unmounts its
 * CHILDREN when closed, but this component would stay mounted if it owned an `open` prop — so
 * `useState(current)` would initialise once and reopening after a cancel would show the abandoned
 * preview instead of the applied style. The caller mounts it only while open, which resets `pending`
 * for free. Do not "simplify" that into an `open` prop; there is a test for it.
 *
 * The preview is sized from the VIEWPORT rather than from its column, and that is a fix rather than
 * a preference: at a fixed 480px wide the poster stood 640px tall, which on a 900px screen pushed
 * the confirm button below `Modal`'s own 90vh cap — the primary action, off screen, on the first
 * frame. The column is `min(37.5vh, 384px)` wide, which at 3:4 is the poster's height
 * too, so one number sizes the pane, the picture and the caption under it. The vh term keeps the
 * whole dialog inside `Modal`'s 90vh cap on a laptop; the 384px ceiling is the sheets' own
 * resolution — they are 768px wide, so 384 CSS px is exactly 1:1 on a 2x display and asking for
 * more would only upscale. It is also what lets `maxWidth` be a constant: 280 + 24 + 1 + 24 + 384 +
 * 56 of padding is the 770 above, so the card stays snug around its contents.
 *
 * The rule between the panes is a 1px grid TRACK rather than a border on the list, so the gap falls
 * evenly on both sides of it and neither column's content width has to absorb padding. It is hidden
 * below `sm`, where the grid is one column and a full-width rule would read as a divider between
 * the list and the poster stacked under it.
 *
 * The poster is `unoptimized`, which is a deliberate exception rather than an oversight. These are
 * static assets already sized for this slot, and measured against the running dev server the
 * optimizer downsized 768 to 750 and re-encoded a 165 KB JPEG to an 85 KB WebP at quality 75 —
 * 34.1 dB PSNR, which on a twelve-up contact sheet of 6px captions and film grain is visible
 * smearing. Next 16 pins quality at 75 unless `images.qualities` is widened, and q90 costs 153 KB
 * to approximate a 165 KB original, so serving the original is both simpler and better. The row
 * thumbnails below stay optimized, where 36px hides everything and the saving is real.
 */
export function BrandStyleDialog({ current, onConfirm, onClose }: BrandStyleDialogProps) {
  const [pending, setPending] = useState<BrandStyleId>(current)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const matches = BRAND_STYLE_IDS.filter((id) => matchesQuery(BRAND_STYLES[id], query))
  const preview = getBrandStyle(pending)

  return (
    <Modal open onClose={onClose} title="Choose a brand style" maxWidth={770}>
      <div
        className={cn(
          CONTROL_SURFACE,
          CONTROL_FOCUS_WITHIN,
          'mb-4 flex items-center gap-1.5 px-2 py-1'
        )}
      >
        <Search className="size-3 shrink-0 text-text2" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search styles"
          aria-label="Search styles"
          className={cn(CONTROL_TEXT, 'border-none bg-transparent outline-none')}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-[280px_1px_min(37.5vh,384px)]">
        <div className="min-w-0">
          {matches.length === 0 ? (
            <p className="px-2.5 py-4 text-caption text-text3">
              No style matches that. Try another word, or clear the search.
            </p>
          ) : (
            <div
              ref={listRef}
              role="listbox"
              aria-label="Brand styles"
              onKeyDown={(event) =>
                rovingFocus(event, focusableItems(listRef.current, '[role="option"]'))
              }
              className="max-h-[50vh] overflow-y-auto overscroll-contain"
            >
              {matches.map((id) => (
                <StyleRow
                  key={id}
                  style={BRAND_STYLES[id]}
                  selected={id === pending}
                  onSelect={() => setPending(id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="hidden bg-line sm:block" />

        <div className="min-w-0">
          <Image
            src={preview.previewSrc}
            alt={`${preview.name} preview`}
            width={768}
            height={1024}
            unoptimized
            className="h-auto w-full rounded-panel bg-sunken"
          />
          <p className="mt-3 text-title font-semibold text-ink">{preview.name}</p>
          <p className="mt-1 text-caption text-text2">{preview.description}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onConfirm(pending)}>
          Use this style
        </Button>
      </div>
    </Modal>
  )
}

/** Whether a style answers what was typed — matched on its name and the one-liner under it. */
function matchesQuery(style: BrandStyle, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${style.name} ${style.description}`.toLowerCase().includes(needle)
}

interface StyleRowProps {
  style: BrandStyle
  /** Whether this is the PENDING choice, not the applied one — the list tracks the preview. */
  selected: boolean
  onSelect: () => void
}

/**
 * One row of the catalogue.
 *
 * `role="option"` is correct here and would be wrong on a layers row: the role is
 * children-presentational, so it flattens everything inside into the option's name. A thumbnail and
 * a name SHOULD flatten; the per-row buttons that
 * `canvas-editor/components/workspace/layers-section.tsx` carries must not, which is why that list
 * argues the other way.
 *
 * Carries no description, though `matchesQuery` still searches one: the poster beside the list
 * already shows the chosen style's, and repeating it on every row is what forced the list wide
 * enough to crowd the thing people are actually looking at.
 *
 * The tick is always mounted and hidden with `opacity-0`, so moving the preview down the list cannot
 * reflow the rows under the pointer.
 */
function StyleRow({ style, selected, onSelect }: StyleRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-chip px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-contour hover:bg-wash',
        FOCUS_RING,
        selected && 'bg-wash'
      )}
    >
      <Image
        src={style.previewSrc}
        alt=""
        width={36}
        height={48}
        className="h-12 w-9 flex-none rounded-sm bg-sunken object-cover"
      />
      <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{style.name}</span>
      <Check
        aria-hidden
        className={cn('size-3.5 flex-none text-forest', !selected && 'opacity-0')}
        strokeWidth={2}
      />
    </button>
  )
}

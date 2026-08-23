'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FOCUS_RING } from '@/components/ui/form/control-classes'
import { MixRead } from '@/components/ui/pillar-mix'
import { cn } from '@/utils/cn'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { BrandSuggestion, SuggestionId } from '@/features/clients/lib/brand-suggestion'

interface ReanalyzeBrandDialogProps {
  open: boolean
  onClose: () => void
  suggestions: BrandSuggestion[]
  /** Receives only the ticked rows. Applying loads them into the form; the save bar still saves. */
  onApply: (accepted: BrandSuggestion[]) => void
}

/**
 * What a fresh website read proposes, field by field, against what the client has now.
 *
 * Every row is opt-in and shows the value it would replace, because this list arrives on a profile
 * someone has already edited by hand: pillars they rewrote, a tone they tuned in review. A single
 * "apply everything" button on top of a model read is how that work disappears without ever being
 * shown to the person losing it. Applying only fills the form — the save bar is still the save.
 */
export function ReanalyzeBrandDialog({
  open,
  onClose,
  suggestions,
  onApply,
}: ReanalyzeBrandDialogProps) {
  // Everything ticked on arrival: the reader asked for the read, so the common case is one click.
  // Keyed by row so a re-read with different rows starts from its own defaults.
  const [excluded, setExcluded] = useState<ReadonlySet<SuggestionId>>(new Set())

  const accepted = suggestions.filter((s) => !excluded.has(s.id))

  function toggle(id: SuggestionId) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function handleApply() {
    onApply(accepted)
    setExcluded(new Set())
  }

  function handleClose() {
    setExcluded(new Set())
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="What the website suggests" maxWidth={640}>
      <div className="flex flex-col gap-5">
        <p className="text-body text-text2">
          Read from this client&rsquo;s site just now. Nothing is saved yet — the rows you keep are
          loaded into the form for you to review and save.
        </p>

        {/* The list scrolls, not the dialog: five comparisons this long push Apply past the fold,
            and an action you have to go looking for reads as absent. Same bound and same reason as
            the sources page picker's page list — one dialog behaviour, not two. */}
        <ul className="max-h-[40vh] divide-y divide-line overflow-y-auto overscroll-contain pr-1">
          {suggestions.map((suggestion) => {
            const isAccepted = !excluded.has(suggestion.id)
            return (
              <li key={suggestion.id} className="py-4 first:pt-0 last:pb-0">
                {/* The name is the whole hit target; the values below sit outside it so they can be
                    read and selected without every click landing on the checkbox. */}
                <label className="flex w-fit cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isAccepted}
                    onChange={() => toggle(suggestion.id)}
                    // accent-forest, not the user-agent default: an unstyled checkbox renders in the
                    // platform blue, and there is no blue anywhere in this interface.
                    className={cn('size-4 flex-none accent-forest', FOCUS_RING)}
                  />
                  <span className="text-body font-medium text-ink">{suggestion.label}</span>
                </label>

                {/* Indented to the label's own x — the 16px box plus the 12px gap — so the pair
                    reads as belonging to that checkbox rather than to the row at large. */}
                <div className="mt-2 flex flex-col gap-2 pl-7">
                  <ValuePanel
                    label="Now"
                    value={suggestion.current}
                    pillars={suggestion.parts?.current}
                  />
                  <ValuePanel
                    label="Suggested"
                    value={suggestion.suggested}
                    pillars={suggestion.parts?.suggested}
                    live={isAccepted}
                  />
                  {/* Only while ticked: an untaken suggestion costs nothing, and a warning about a
                      consequence that is not going to happen is noise the reader learns to skip. */}
                  {isAccepted && suggestion.warning && (
                    <p className="flex gap-2 text-caption text-pending">
                      <AlertTriangle size={13} className="mt-[3px] flex-none" aria-hidden />
                      <span>{suggestion.warning}</span>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={accepted.length === 0}
            onClick={handleApply}
          >
            {accepted.length === 1 ? 'Apply 1 change' : `Apply ${accepted.length} changes`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * One side of the comparison, told apart by ground rather than by weight alone.
 *
 * The incoming value sits on Wash carrying solid Forest ink — the tint this system keeps for quiet
 * emphasis — while the outgoing one sits in a Sunken well and reads as already spent. Two lines of
 * near-identical prose are otherwise indistinguishable at a glance, and seeing the change is the
 * whole job of this dialog: a reader should not have to diff two sentences by eye.
 *
 * `live` false returns the row to the spent treatment, so an unticked suggestion shows two grey
 * wells — a shape that says nothing about this field is going to move.
 *
 * `pillars` switches the body to the mix reader, which names each pillar on its own line with its
 * share: four of them joined by separators is a paragraph, and nobody compares two paragraphs.
 */
function ValuePanel({
  label,
  value,
  pillars,
  live,
}: {
  label: string
  value: string
  pillars?: readonly WeightedPillar[]
  live?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-sm px-3 py-2 transition-colors duration-150 ease-contour',
        live ? 'bg-wash' : 'bg-sunken'
      )}
    >
      <span
        className={cn(
          'block text-label font-semibold uppercase',
          live ? 'text-forest' : 'text-text3'
        )}
      >
        {label}
      </span>
      {pillars && pillars.length > 0 ? (
        <div className="mt-1.5">
          <MixRead pillars={pillars} />
        </div>
      ) : (
        <p
          className={cn(
            'mt-1 text-body',
            live ? 'font-medium text-ink' : 'text-text2',
            !value && 'italic text-text3'
          )}
        >
          {value || 'Not set'}
        </p>
      )}
    </div>
  )
}

'use client'

import { useId, useState } from 'react'
import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { BriefingUpdates } from '@/features/dashboard/components/briefing-updates'
import { cn } from '@/utils/cn'
import type { BriefingItem } from '@/ai/intelligence/schema'

interface BriefingActionsProps {
  items: BriefingItem[]
  /** "Monday 7 September" — the week the items describe, formatted by the server. */
  weekLabel: string
  /** False when this week's brief has not been written yet and last week's is still showing. */
  isCurrentWeek: boolean
}

/**
 * The bar's right-hand side: one toggle, and the week's changes under it when open.
 *
 * The only client state on the dashboard's briefing, and the smallest leaf that can hold it: the
 * bar renders on the server and hands in plain data. The panel is not a separate column any more —
 * it is a full-width flex child of the bar, so the title row stays put and the rows get the
 * card's whole width (the user asked for symmetry; a 58ch column beside a centred title was not).
 * Its 18px radius is the client-coverage capsule's (coverage-row.tsx), so the two blobs on the
 * page match — the tip's 10px chip radius read as square once the box spanned the card.
 *
 * The stale wording is the honest state, not a feature: the Monday tick writes the week's brief,
 * and until it has, the bar shows last week's and says so.
 */
export function BriefingActions({ items, weekLabel, isCurrentWeek }: BriefingActionsProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const label = open ? 'Hide updates' : isCurrentWeek ? 'Show updates' : "Show last week's updates"

  return (
    <>
      <div className="flex shrink-0 flex-col items-end">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {label} <span className="tabular-nums text-text3">{items.length}</span>
          <Icon
            glyph={AltArrowDownIcon}
            size="xs"
            className={cn('transition-transform duration-150 ease-contour', open && 'rotate-180')}
          />
        </Button>
      </div>

      {open && (
        <div id={panelId} className="basis-full rounded-[18px] bg-wash px-4 py-3">
          <p className="border-b border-forest/10 pb-2 text-caption text-text3">
            Instagram and Facebook · Week of {weekLabel}
          </p>
          <BriefingUpdates items={items} />
        </div>
      )}
    </>
  )
}

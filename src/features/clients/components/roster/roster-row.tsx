import Link from 'next/link'
import type { ClientRosterEntry } from '@/features/clients/lib/roster'
import { ChannelChips } from '@/features/clients/components/roster/channel-chips'
import { RowStatus } from '@/features/clients/components/roster/row-status'
import { ROSTER_GRID } from '@/features/clients/components/roster/grid'
import { formatPublishSlot } from '@/features/dashboard/lib/metrics'
import { cn } from '@/utils/cn'

interface RosterRowProps {
  entry: ClientRosterEntry
  timezone: string
}

/** One client in the roster table — identity, channels, status, and next slot. */
export function RosterRow({ entry, timezone }: RosterRowProps) {
  const next = entry.nextPostAt ? formatPublishSlot(entry.nextPostAt, timezone) : null

  return (
    <tr
      className={cn(
        ROSTER_GRID,
        'group relative items-center rounded-panel border-t border-line px-3 py-3.5',
        'transition-colors duration-150 ease-contour hover:bg-wash/60'
      )}
    >
      <td className="flex min-w-0 items-center gap-3">
        {/* Marks the row as needing attention. Never the only signal — the status
            column always spells out why in words.

            Amber, not lime, on two counts: attention is a permanent property of
            the row rather than the present tense (The Standing Place Rule), and
            a 3px lime bar on white is 1.35:1 — invisible (The Small Present Rule).

            It lives inside this cell because a <tr> may only contain <td>/<th>;
            as a direct child it tripped a hydration error. The cell is not
            positioned, so `absolute` still resolves against the row and the bar
            lands in exactly the same place. */}
        {entry.needsAttention && (
          <span
            aria-hidden="true"
            className="absolute inset-y-3.5 left-0.5 w-[3px] rounded-full bg-pending"
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 flex-none place-items-center rounded-panel bg-forest-deep',
            'text-micro font-bold text-white',
            // Lifts the badge off the card; no token covers a mark this small.
            'shadow-[0_6px_16px_-6px_rgba(15,21,18,0.35)]'
          )}
        >
          {entry.initials}
        </span>
        <span className="min-w-0">
          {/* The whole row is the control: this link is the accessible name and
              its ::after covers the row, so a screen reader hears one target per
              client rather than a column of identical chevrons. */}
          <Link
            href={`/clients/${entry.id}/edit`}
            className="block truncate text-sm font-semibold text-ink after:absolute after:inset-0 after:content-['']"
          >
            {entry.name}
          </Link>
          {entry.niche && (
            <span className="mt-0.5 block truncate text-caption text-text3">{entry.niche}</span>
          )}
        </span>
      </td>

      {/* `relative` lifts this cell above the row-link's inset-0 ::after. Both are
          positioned descendants of the same <tr>, so painting order is DOM order
          and this cell comes later — without it the overlay covers the chips and
          swallows their title tooltips, the only place a sighted mouse user can
          read a connection's state. The overlay still covers every other cell,
          so the whole row remains one click target. */}
      <td className="relative hidden min-[1180px]:block">
        <ChannelChips channels={entry.channels} />
      </td>

      <td className="min-w-0">
        <RowStatus entry={entry} timezone={timezone} />
      </td>

      <td className="hidden text-body leading-snug min-[1180px]:block">
        {next ? (
          <span className="text-text2">{next.label}</span>
        ) : (
          <span className="text-text3" aria-label="Nothing scheduled">
            &mdash;
          </span>
        )}
        <span className="mt-[3px] block text-caption text-text3">
          {entry.queuedCount} queued
        </span>
      </td>

      <td className="justify-self-end">
        <span
          aria-hidden="true"
          className={cn(
            'block text-text3 opacity-0 transition-opacity duration-150',
            'group-hover:opacity-100 group-focus-within:opacity-100'
          )}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 2.5L8 6l-3.5 3.5" />
          </svg>
        </span>
      </td>
    </tr>
  )
}

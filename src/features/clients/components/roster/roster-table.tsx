import type { ClientRosterEntry } from '@/features/clients/lib/roster'
import { RosterRow } from '@/features/clients/components/roster/roster-row'
import { ROSTER_GRID } from '@/features/clients/components/roster/grid'
import { EmptyState } from '@/components/layout/empty-state'
import { Card } from '@/components/ui/card'
import { cn } from '@/utils/cn'

interface RosterTableProps {
  entries: ClientRosterEntry[]
  timezone: string
  /** Rendered under the rows — the "N more on schedule" footer. */
  footer?: React.ReactNode
}

const HEADER_CELL = 'text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text3'

export function RosterTable({ entries, timezone, footer }: RosterTableProps) {
  return (
    <Card className="mt-4 px-[18px] pb-4 pt-2">
      {entries.length === 0 ? (
        <EmptyState
          title="No clients match this filter"
          description="Clear the filter to see the whole roster."
        />
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className={cn(ROSTER_GRID, 'items-center px-3 pb-[11px] pt-2.5 text-left')}>
              <th scope="col" className={HEADER_CELL}>
                Client
              </th>
              <th scope="col" className={cn(HEADER_CELL, 'hidden min-[1180px]:block')}>
                Channels
              </th>
              <th scope="col" className={HEADER_CELL}>
                Status
              </th>
              <th scope="col" className={cn(HEADER_CELL, 'hidden min-[1180px]:block')}>
                Next post
              </th>
              {/* The chevron column carries no heading of its own. */}
              <th scope="col">
                <span className="sr-only">Open client</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <RosterRow key={entry.id} entry={entry} timezone={timezone} />
            ))}
          </tbody>
        </table>
      )}
      {footer}
    </Card>
  )
}

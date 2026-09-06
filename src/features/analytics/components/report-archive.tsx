import Link from 'next/link'
import { analyticsWindowHref } from '../lib/compute/analytics-href'
import { formatPeriodRange, formatSyncInstant } from '../lib/compute/format'
import { ArchiveRowDelete } from './archive-row-delete'
import type { ArchiveEntry } from '../types'

/**
 * Every exported period, kept as it was written. A row is a link back into
 * the console pinned to that window — the stored narrative rides along, so
 * the page re-reads history without a separate report viewer.
 */
export function ReportArchive({
  entries,
  clientId,
  timezone,
  network,
}: {
  entries: ArchiveEntry[]
  clientId: string
  timezone: string
  /** Rides each row's link so an opened report stays on the network it was exported from. */
  network?: string
}) {
  if (entries.length === 0) {
    return (
      <p className="mt-2 text-caption text-text3">
        Reports you export land here, kept exactly as they were written.
      </p>
    )
  }
  return (
    <div className="mt-2.5 grid">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-4 border-b border-ink/[0.05] py-2.5 text-caption last:border-b-0"
        >
          <Link
            href={analyticsWindowHref(clientId, entry.period_start, entry.period_end, network)}
            className="font-medium text-forest hover:underline"
          >
            {formatPeriodRange(entry.period_start, entry.period_end)}
          </Link>
          <span className="flex items-center gap-3">
            <span className="text-micro tabular-nums text-text3">
              written {formatSyncInstant(entry.created_at, timezone)}
            </span>
            <ArchiveRowDelete reportId={entry.id} />
          </span>
        </div>
      ))}
    </div>
  )
}

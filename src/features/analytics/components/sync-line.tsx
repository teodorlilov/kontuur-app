import { cn } from '@/utils/cn'
import { MS_PER_DAY } from '@/utils/constants'
import { formatSyncInstant } from '../lib/format'

/** Two missed nightly syncs is a problem, one is jitter. */
const STALE_AFTER_MS = 2 * MS_PER_DAY

function isStale(lastSyncAt: string | null): boolean {
  return !lastSyncAt || Date.now() - Date.parse(lastSyncAt) > STALE_AFTER_MS
}

/**
 * The document's closing line: when the numbers were last true. Living Green
 * while the nightly sync is landing; Amber once it has missed two nights —
 * the stale state the mock names in its footer.
 */
export function SyncLine({
  lastSyncAt,
  hasHistory,
  hasConnection,
  timezone,
}: {
  lastSyncAt: string | null
  hasHistory: boolean
  hasConnection: boolean
  timezone: string
}) {
  const stale = hasHistory && isStale(lastSyncAt)
  const warn = stale || (hasHistory && !hasConnection)

  let message: string
  if (!hasHistory) {
    message = 'Connected · first sync tonight, 03:30'
  } else if (!hasConnection) {
    message = `Instagram disconnected — metrics stopped${
      lastSyncAt ? ` ${formatSyncInstant(lastSyncAt, timezone)}` : ''
    } · reconnect to resume`
  } else if (stale) {
    message = `Last sync ${
      lastSyncAt ? formatSyncInstant(lastSyncAt, timezone) : 'unknown'
    } — more than two nights ago · reconnect Instagram if this persists`
  } else {
    message = `Synced nightly · last sync ${
      lastSyncAt ? formatSyncInstant(lastSyncAt, timezone) : '—'
    } · next tonight, 03:30`
  }

  return (
    <div
      className={cn(
        'mt-6 flex items-center gap-2 text-micro',
        warn ? 'text-pending' : 'text-text3'
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 flex-none rounded-full', warn ? 'bg-pending' : 'bg-spring')}
      />
      {message}
    </div>
  )
}

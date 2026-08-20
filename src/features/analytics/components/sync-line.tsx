import { cn } from '@/utils/cn'
import { MS_PER_DAY } from '@/utils/constants'
import { formatSyncInstant } from '../lib/format'

/** Two missed nightly syncs is a problem, one is jitter. */
const STALE_AFTER_MS = 2 * MS_PER_DAY

function isStale(lastSyncAt: string | null): boolean {
  return !lastSyncAt || Date.now() - Date.parse(lastSyncAt) > STALE_AFTER_MS
}

/** "partial sync (1 of 5 phases) — demographics: …" → "demographics". */
function failedPhases(syncError: string): string | null {
  const detail = syncError.split('—').slice(1).join('—').trim()
  if (!detail) return null
  const names = detail
    .split('|')
    .map((part) => part.split(':')[0]?.trim())
    .filter((name): name is string => Boolean(name))
  return names.length > 0 ? names.join(' and ') : null
}

/**
 * The document's closing line: when the numbers were last true. Living Green
 * while the nightly sync is landing; Amber once it has missed two nights —
 * the stale state the mock names in its footer — or when the last run came
 * back incomplete. That last case is the one this line used to get wrong: it
 * reads max(fetched_at), which the on-demand refill also stamps, so a sync
 * failing every night still looked freshly landed.
 */
export function SyncLine({
  lastSyncAt,
  hasHistory,
  hasConnection,
  timezone,
  syncError = null,
}: {
  lastSyncAt: string | null
  hasHistory: boolean
  hasConnection: boolean
  timezone: string
  /** The last run's verdict — null after a clean one (migration 20260828). */
  syncError?: string | null
}) {
  const stale = hasHistory && isStale(lastSyncAt)
  const incomplete = hasHistory && hasConnection && syncError !== null
  const warn = stale || incomplete || (hasHistory && !hasConnection)

  let message: string
  if (!hasHistory) {
    message = 'Connected · first sync tonight, 03:30'
  } else if (!hasConnection) {
    message = `Instagram disconnected — metrics stopped${
      lastSyncAt ? ` ${formatSyncInstant(lastSyncAt, timezone)}` : ''
    } · reconnect to resume`
  } else if (incomplete) {
    const phases = failedPhases(syncError)
    message = `Last sync did not finish${
      phases ? ` — ${phases} did not update` : ''
    } · these sections may be out of date, retrying tonight at 03:30`
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

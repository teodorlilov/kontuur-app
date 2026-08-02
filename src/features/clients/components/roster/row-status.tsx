import type { ClientRosterEntry } from '@/features/clients/lib/roster'
import { formatPublishSlot } from '@/features/dashboard/lib/metrics'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'

interface RowStatusProps {
  entry: ClientRosterEntry
  timezone: string
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * The headline and its detail line, derived per status.
 *
 * Every string here is built from data the row actually loaded. Nothing asserts
 * a state we cannot see — a healthy row reports how far its schedule reaches
 * rather than claiming everything is approved.
 */
function copyFor(
  entry: ClientRosterEntry,
  timezone: string
): { headline: string; detail: string | null } {
  switch (entry.status) {
    case 'connection_missing':
      return {
        headline: 'No account connected',
        detail:
          entry.queuedCount > 0
            ? `${plural(entry.queuedCount, 'post')} will fail`
            : 'Nothing can publish',
      }

    case 'awaiting_approval':
      return {
        headline: `${plural(entry.approvalCount, 'post')} awaiting approval`,
        detail: entry.oldestApprovalAt
          ? `Oldest sent ${formatRelativeTime(new Date(entry.oldestApprovalAt))}`
          : null,
      }

    case 'connection_expiring': {
      const days = entry.expiresInDays
      return {
        headline: 'Connection expiring',
        detail: days === null ? 'Reconnect needed' : `In ${plural(days, 'day')} · reconnect needed`,
      }
    }

    case 'queue_empty':
      return { headline: 'Nothing scheduled', detail: 'The queue is empty' }

    case 'on_schedule':
      return {
        headline: 'On schedule',
        detail: entry.lastPostAt
          ? `Scheduled through ${formatPublishSlot(entry.lastPostAt, timezone).label}`
          : null,
      }
  }
}

/** The status column: what is true of this client, in words rather than colour. */
export function RowStatus({ entry, timezone }: RowStatusProps) {
  const { headline, detail } = copyFor(entry, timezone)
  return (
    <div className="text-body leading-snug">
      <span className={cn(entry.needsAttention ? 'text-ink' : 'text-text2')}>{headline}</span>
      {detail && <span className="mt-[3px] block text-caption text-text3">{detail}</span>}
    </div>
  )
}

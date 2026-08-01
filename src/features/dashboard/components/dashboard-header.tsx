import { hasCyrillic } from '@/lib/canvas/font-library'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { cn } from '@/utils/cn'
import { ActionLink } from '@/components/ui/action-link'
import {
  HeaderMeta,
  MetaFlag,
  MetaWarn,
  PageHeader,
} from '@/components/layout/page-header/page-header'

interface DashboardHeaderProps {
  agencyName: string
  clientCount: number
  isSolo: boolean
  /** IANA timezone of the agency — the greeting follows the reader's day, not the server's. */
  timezone: string
  pendingCount: number
  oldestPendingAt: string | null
  failedCount: number
}

/** Time-of-day greeting in the agency's own timezone. */
function resolveGreeting(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: timezone }).format(
      new Date()
    )
  )
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The dashboard's greeting header. */
export function DashboardHeader({
  agencyName,
  clientCount,
  isSolo,
  timezone,
  pendingCount,
  oldestPendingAt,
  failedCount,
}: DashboardHeaderProps) {
  const name = agencyName || 'there'

  return (
    <PageHeader
      crumb={[]}
      title={
        <>
          {resolveGreeting(timezone)},{' '}
          {/* Instrument Serif has no Cyrillic — Cyrillic names stay in the sans face. */}
          <em
            className={cn(
              'text-forest',
              hasCyrillic(name) ? 'font-sans not-italic' : 'font-display font-normal italic'
            )}
          >
            {name}
          </em>
        </>
      }
      meta={
        <HeaderMeta
          parts={[
            // The date moved up to the rail, so this line leads with whatever
            // actually needs the reader today rather than restating the day.
            pendingCount > 0 && (
              <MetaFlag>
                {pendingCount} {pendingCount === 1 ? 'draft' : 'drafts'} waiting
                {oldestPendingAt ? ` since ${formatRelativeTime(parseTimestamp(oldestPendingAt))}` : ''}
              </MetaFlag>
            ),
            failedCount > 0 && <MetaWarn>{failedCount} failed to publish</MetaWarn>,
            isSolo
              ? 'Your workspace'
              : `${clientCount} ${clientCount === 1 ? 'client' : 'clients'} active`,
          ]}
        />
      }
      actions={
        <>
          {!isSolo && (
            <ActionLink href="/clients/new" variant="secondary">
              Add client
            </ActionLink>
          )}
          <ActionLink href="/generate">
            {isSolo ? 'Create content' : 'Generate posts'} <span aria-hidden="true">→</span>
          </ActionLink>
        </>
      }
    />
  )
}

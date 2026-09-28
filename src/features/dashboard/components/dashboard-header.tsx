import { hasCyrillic } from '@/lib/canvas/font-library'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { cn } from '@/utils/cn'
import { GatedAction } from '@/components/ui/gated-action'
import type { AddBrandGate } from '@/lib/billing/copy'
import type { GenerateGate } from '@/lib/billing/post-allowance'
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
  /** Whether a run may start (`generationGate`) — the CTA carries its refusal and way out. */
  generate: GenerateGate
  /** What "Add client" says: its refusal or what a client costs, and its way out (`addBrandGate`). */
  addClient: AddBrandGate
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

/**
 * The dashboard's greeting header. The name is set in Instrument Serif, which has no Cyrillic, so a
 * Cyrillic name stays in the sans face. The meta line leads with whatever needs the reader today —
 * the date sits in the rail. "Add client" and "Generate posts" are refused in place, with the
 * reason (`GatedAction`), and link to Plan & billing only when a plan is the way past the refusal
 * (`AddBrandGate.wayOut`, src/lib/billing/copy.ts; `GenerateGate.wayOut`,
 * src/lib/billing/post-allowance.ts) — never for a member, nor for a figure that could not be read.
 */
export function DashboardHeader({
  agencyName,
  clientCount,
  isSolo,
  timezone,
  pendingCount,
  oldestPendingAt,
  failedCount,
  generate,
  addClient,
}: DashboardHeaderProps) {
  const name = agencyName || 'there'

  return (
    <PageHeader
      crumb={[]}
      title={
        <>
          {resolveGreeting(timezone)},{' '}
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
            pendingCount > 0 && (
              <MetaFlag>
                {pendingCount} {pendingCount === 1 ? 'draft' : 'drafts'} waiting
                {oldestPendingAt
                  ? ` since ${formatRelativeTime(parseTimestamp(oldestPendingAt))}`
                  : ''}
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
            <GatedAction
              href="/clients/new"
              label="Add client"
              refusal={addClient.refusal}
              note={addClient.note}
              refusalId="add-client-refusal"
              variant="secondary"
              wayOut={addClient.wayOut}
            />
          )}
          <GatedAction
            href="/generate"
            label={isSolo ? 'Create content' : 'Generate posts'}
            refusal={generate.refusal}
            refusalId="generate-refusal"
            wayOut={generate.wayOut}
          />
        </>
      }
    />
  )
}

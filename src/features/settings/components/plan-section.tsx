// No 'use client': plan and usage are read-only, and the settings page passes these in as
// elements rather than importing them into the client view.
import { Button } from '@/components/ui/button'
import { FormSection } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import { capitalize, formatLongDate } from '@/utils/format'
import type { AgencyInfo } from '@/types/api'

interface PlanSectionProps {
  agency: AgencyInfo
  /** Real client count — the plan limit is meaningless without the usage beside it. */
  clientCount: number
}

/** Plan, trial status and usage against the client allowance. */
export function PlanSection({ agency, clientCount }: PlanSectionProps) {
  const isTrial = agency.subscription_status === 'trialing'
  const isExpired = agency.subscription_status === 'expired'
  const isActive = agency.subscription_status === 'active'

  return (
    <FormSection legend="Plan &amp; billing" description="Usage limits and trial status.">
      <div className="col-span-12">
        <PlanRow label="Current plan" note={isActive ? undefined : 'No card on file'}>
          <StatusPill tone={isActive ? 'ok' : 'mark'}>{capitalize(agency.plan)}</StatusPill>
        </PlanRow>

        <PlanRow label="Status">
          <StatusPill tone={isActive ? 'ok' : isExpired ? 'bad' : 'warn'}>
            {isTrial ? 'Trial' : capitalize(agency.subscription_status)}
          </StatusPill>
        </PlanRow>

        {(isTrial || isExpired) && agency.trial_ends_at && (
          <PlanRow label="Trial ends">
            <span className={cn('text-body font-medium', isExpired ? 'text-danger' : 'text-ink')}>
              {formatLongDate(new Date(agency.trial_ends_at))}
              {isExpired ? ' · expired' : ''}
            </span>
          </PlanRow>
        )}

        <PlanRow label="Clients">
          <ClientUsage used={clientCount} limit={agency.plan_client_limit} />
        </PlanRow>

        <PlanRow label="Mode" isLast>
          <span className="text-body font-medium text-ink">
            {agency.mode === 'solo' ? 'Solo' : 'Agency'}
          </span>
        </PlanRow>
      </div>
    </FormSection>
  )
}

/** Usage against the plan's client allowance, with a meter once there is a finite limit. */
function ClientUsage({ used, limit }: { used: number; limit: number }) {
  if (limit === -1) {
    return <span className="text-body font-medium tabular-nums text-ink">{used} of unlimited</span>
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const atLimit = used >= limit

  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn('text-body font-medium tabular-nums', atLimit ? 'text-pending' : 'text-ink')}
      >
        {used} of {limit} used
      </span>
      <span aria-hidden className="block h-1.5 w-24 overflow-hidden rounded-full bg-line">
        {/* Computed width: the one inline style DESIGN.md allows, because it encodes a value. */}
        <span
          className={cn('block h-full rounded-full', atLimit ? 'bg-pending' : 'bg-forest')}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  )
}

function PlanRow({
  label,
  note,
  children,
  isLast,
}: {
  label: string
  note?: string
  children: React.ReactNode
  isLast?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-3',
        !isLast && 'border-b border-line'
      )}
    >
      <div>
        <b className="block text-body font-semibold text-ink">{label}</b>
        {note && <span className="text-caption text-text3">{note}</span>}
      </div>
      {children}
    </div>
  )
}

/** Upgrade prompt for the Account rail. */
export function UpgradeRailAction() {
  return (
    <>
      {/* Disabled rather than a live-looking button that reports "coming soon" after the click. */}
      <Button className="w-full" disabled>
        Upgrade plan
      </Button>
      <p className="mt-2.5 text-center text-caption text-text3">Billing is not connected yet.</p>
    </>
  )
}

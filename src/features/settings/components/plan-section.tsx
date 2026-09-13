// No 'use client': plan and usage are read-only, and the settings page passes these in as
// elements rather than importing them into the client view.
import { FormSection } from '@/components/ui/form'
import { StatusPill, type PillTone } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import { capitalize, formatLongDate } from '@/utils/format'
import type { Entitlement, EntitlementState } from '@/lib/billing/entitlement'
import { ALLOWANCE_NOUNS } from '@/lib/billing/copy'
import { PLAN_LABELS, UNMETERED, type Allowance, type AllowanceKind } from '@/lib/billing/plans'

interface PlanSectionProps {
  entitlement: Entitlement
  /** What the workspace has used this period — the meters mean nothing without it. */
  usage: Allowance
  /** Real brand count, beside the allowance so the cap is legible. */
  brandCount: number
}

/** Share of an allowance at which the meter turns Amber. */
const WARN_AT = 0.8

/**
 * Status in the fixed pairs only: Amber for attention, Clay for the two states that need an
 * action, Wash for a paying workspace. The plan name is a neutral label — a permanent property,
 * never lime (DESIGN.md, Fill-Only Lime).
 */
const STATUS: Record<EntitlementState, { label: string; tone: PillTone }> = {
  trial: { label: 'Trial', tone: 'warn' },
  trial_grace: { label: 'Trial ended', tone: 'bad' },
  active: { label: 'Active', tone: 'ok' },
  past_due: { label: 'Payment failed', tone: 'warn' },
  locked: { label: 'Paused', tone: 'bad' },
}

const METERS: AllowanceKind[] = ['draft', 'image', 'rewrite']

/** Plan, status, the date that matters next, and usage against every allowance. */
export function PlanSection({ entitlement, usage, brandCount }: PlanSectionProps) {
  const status = STATUS[entitlement.state]
  const dateLabel =
    entitlement.state === 'trial' || entitlement.state === 'trial_grace'
      ? 'Trial ends'
      : entitlement.state === 'active' || entitlement.state === 'past_due'
        ? 'Renews on'
        : null

  return (
    <FormSection
      legend="Plan &amp; billing"
      description="Your plan, its allowances, and how much of them this period has used."
    >
      <div className="col-span-12">
        <PlanRow label="Current plan">
          <StatusPill tone="neutral">{PLAN_LABELS[entitlement.plan]}</StatusPill>
        </PlanRow>

        <PlanRow label="Status">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </PlanRow>

        {dateLabel && entitlement.resetsOn && (
          <PlanRow label={dateLabel}>
            <span
              className={cn(
                'text-body font-medium tabular-nums',
                entitlement.state === 'trial_grace' ? 'text-danger' : 'text-ink'
              )}
            >
              {formatLongDate(entitlement.resetsOn)}
            </span>
          </PlanRow>
        )}

        <PlanRow label="Brands">
          <Meter
            used={brandCount}
            limit={entitlement.brandsUnlimited ? null : entitlement.brands}
            noun="brands"
          />
        </PlanRow>

        {METERS.map((kind, index) => (
          <PlanRow
            key={kind}
            label={capitalize(ALLOWANCE_NOUNS[kind])}
            isLast={index === METERS.length - 1}
          >
            <Meter
              used={usage[kind]}
              limit={entitlement.limits[kind] >= UNMETERED ? null : entitlement.limits[kind]}
              noun={ALLOWANCE_NOUNS[kind]}
            />
          </PlanRow>
        ))}
      </div>
    </FormSection>
  )
}

/**
 * Usage against an allowance, with a bar once there is a finite limit. Amber from 80 %, Clay
 * at the cap — the same thresholds the bell notifications fire at.
 */
function Meter({ used, limit, noun }: { used: number; limit: number | null; noun: string }) {
  if (limit === null) {
    return (
      <span className="text-body font-medium tabular-nums text-ink">
        {used} {noun}
      </span>
    )
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100
  const atLimit = limit === 0 || used >= limit
  const warning = !atLimit && used >= limit * WARN_AT

  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          'text-body font-medium tabular-nums',
          atLimit ? 'text-danger' : warning ? 'text-pending' : 'text-ink'
        )}
      >
        {used} of {limit}
      </span>
      <span aria-hidden className="block h-1.5 w-24 overflow-hidden rounded-full bg-line">
        {/* Computed width: the one inline style DESIGN.md allows, because it encodes a value. */}
        <span
          className={cn(
            'block h-full rounded-full',
            atLimit ? 'bg-danger' : warning ? 'bg-pending' : 'bg-forest'
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="sr-only">
        {used} of {limit} {noun} used this period
      </span>
    </span>
  )
}

function PlanRow({
  label,
  children,
  isLast,
}: {
  label: string
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
      <b className="block text-body font-semibold text-ink">{label}</b>
      {children}
    </div>
  )
}

// No 'use client': plan and usage are read-only, and the settings page passes these in as
// elements rather than importing them into the client view.
import { FormSection } from '@/components/ui/form'
import { StatusPill, type PillTone } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import { capitalize, formatLongDate } from '@/utils/format'
import type { Entitlement, EntitlementState } from '@/lib/billing/entitlement'
import { ALLOWANCE_NOUNS, brandsLabel, brandWord } from '@/lib/billing/copy'
import {
  ALLOWANCE_WARN_SHARE,
  meteredLimit,
  PLAN_LABELS,
  type Allowance,
  type AllowanceKind,
} from '@/lib/billing/plans'

interface PlanSectionProps {
  entitlement: Entitlement
  /** What the workspace has used this period — the meters mean nothing without it. */
  usage: Allowance
  /** Real brand count, beside the allowance so the cap is legible. */
  brandCount: number
}

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

/**
 * The one date that matters next, by state: when the trial ends, when a failed card pauses the
 * workspace, when a cancelled plan ends, when a paid allowance renews. Null when there is
 * nothing to wait for.
 */
function nextDate(entitlement: Entitlement): { label: string; at: Date } | null {
  const { state, trialEndsAt, graceEndsAt, resetsOn, endsOn } = entitlement
  if ((state === 'trial' || state === 'trial_grace') && trialEndsAt)
    return { label: 'Trial ends', at: trialEndsAt }
  if (state === 'past_due' && graceEndsAt) return { label: 'Update your card by', at: graceEndsAt }
  if (state === 'active' && endsOn) return { label: 'Ends on', at: endsOn }
  if (state === 'active' && resetsOn) return { label: 'Renews on', at: resetsOn }
  return null
}

/** Plan, status, the date that matters next, and usage against every allowance. */
export function PlanSection({ entitlement, usage, brandCount }: PlanSectionProps) {
  const status = STATUS[entitlement.state]
  const date = nextDate(entitlement)

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

        {date && (
          <PlanRow label={date.label}>
            <span
              className={cn(
                'text-body font-medium tabular-nums',
                entitlement.state === 'trial_grace' ? 'text-danger' : 'text-ink'
              )}
            >
              {formatLongDate(date.at, entitlement.timezone)}
            </span>
          </PlanRow>
        )}

        <PlanRow label={brandsLabel(entitlement.mode)}>
          <Meter
            used={brandCount}
            limit={entitlement.brandsUnlimited ? null : entitlement.brands}
            noun={brandWord(entitlement.mode, 2)}
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
              limit={meteredLimit(entitlement.limits[kind])}
              noun={ALLOWANCE_NOUNS[kind]}
            />
          </PlanRow>
        ))}
      </div>
    </FormSection>
  )
}

/**
 * Usage against an allowance, with a bar once there is a finite limit. Amber from
 * `ALLOWANCE_WARN_SHARE`, Clay at the cap — the same line the bell fires at. The bar's width is
 * the one inline style DESIGN.md allows, because it encodes a value.
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
  const warning = !atLimit && used >= limit * ALLOWANCE_WARN_SHARE

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

import { FormSection } from '@/components/ui/form'
import { StatusPill, type PillTone } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import { capitalize, formatLongDate } from '@/utils/format'
import type { Entitlement, EntitlementState } from '@/lib/billing/entitlement'
import {
  ALLOWANCE_NOUNS,
  PLAN_SECTION,
  brandsLabel,
  brandWord,
  cannotSpendNotice,
} from '@/lib/billing/copy'
import {
  ALLOWANCE_KINDS,
  ALLOWANCE_WARN_SHARE,
  meteredLimit,
  PLAN_LABELS,
  type Allowance,
} from '@/lib/billing/plans'

interface PlanSectionProps {
  entitlement: Entitlement
  /** What the workspace has used this period — the meters mean nothing without it. */
  usage: Allowance
  /** Real brand count, beside the allowance so the cap is legible. */
  brandCount: number
}

/**
 * Status tones in the fixed pairs only: Amber for attention, Clay for the two states that need
 * an action, Wash for a paying workspace. The words are copy.ts's (`PLAN_SECTION.states`). The
 * plan name is a neutral label — a permanent property, never lime (DESIGN.md, Fill-Only Lime).
 */
const STATUS_TONE: Record<EntitlementState, PillTone> = {
  trial: 'warn',
  trial_grace: 'bad',
  active: 'ok',
  past_due: 'warn',
  locked: 'bad',
}

/**
 * The one date that matters next, by state: when the trial ends, when an ended trial's grace
 * pauses the workspace, when a failed card pauses it, when a cancelled plan ends, when a paid
 * allowance renews. Null when there is nothing to wait for.
 */
function nextDate(entitlement: Entitlement): { label: string; at: Date } | null {
  const { state, trialEndsAt, graceEndsAt, resetsOn, endsOn } = entitlement
  const { dates } = PLAN_SECTION
  if (state === 'trial' && trialEndsAt) return { label: dates.trialEnds, at: trialEndsAt }
  if (state === 'trial_grace' && graceEndsAt) return { label: dates.pausesOn, at: graceEndsAt }
  if (state === 'past_due' && graceEndsAt) return { label: dates.updateCardBy, at: graceEndsAt }
  if (state === 'active' && endsOn) return { label: dates.endsOn, at: endsOn }
  if (state === 'active' && resetsOn) return { label: dates.renewsOn, at: resetsOn }
  return null
}

/**
 * Plan, status, the date that matters next, and usage against every allowance. Not a client
 * component: plan and usage are read-only, and the settings page passes it in as an element.
 *
 * A workspace that cannot spend has no allowance to measure, so its brand row is a plain count
 * ("1 business", "3 clients") with no cap and no danger colour, and the three meters give way to
 * the one sentence that says why (`cannotSpendNotice`) — in the trial's grace, the banner's own.
 */
export function PlanSection({ entitlement, usage, brandCount }: PlanSectionProps) {
  const date = nextDate(entitlement)
  const notice = cannotSpendNotice(entitlement)
  const brandLimit = notice || entitlement.brandsUnlimited ? null : entitlement.brands

  return (
    <FormSection legend={PLAN_SECTION.legend} description={PLAN_SECTION.description}>
      <div className="col-span-12">
        <PlanRow label={PLAN_SECTION.plan}>
          <StatusPill tone="neutral">{PLAN_LABELS[entitlement.plan]}</StatusPill>
        </PlanRow>

        <PlanRow label={PLAN_SECTION.status}>
          <StatusPill tone={STATUS_TONE[entitlement.state]}>
            {PLAN_SECTION.states[entitlement.state]}
          </StatusPill>
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

        <PlanRow label={brandsLabel(entitlement.mode)} isLast={notice !== null}>
          <Meter
            used={brandCount}
            limit={brandLimit}
            noun={brandWord(entitlement.mode, brandLimit === null ? brandCount : 2)}
          />
        </PlanRow>

        {notice ? (
          <p className="pt-3 text-body text-text2">{notice.text}</p>
        ) : (
          ALLOWANCE_KINDS.map((kind, index) => (
            <PlanRow
              key={kind}
              label={capitalize(ALLOWANCE_NOUNS[kind])}
              isLast={index === ALLOWANCE_KINDS.length - 1}
            >
              <Meter
                used={usage[kind]}
                limit={meteredLimit(entitlement.limits[kind])}
                noun={ALLOWANCE_NOUNS[kind]}
              />
            </PlanRow>
          ))
        )}
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

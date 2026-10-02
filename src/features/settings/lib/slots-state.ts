import { slotsUnavailable } from '@/lib/billing/copy'
import type { Entitlement } from '@/lib/billing/entitlement'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'

/**
 * What the slot control (`ClientSlotsControl`, src/features/settings/components/
 * client-slots-control.tsx) shows: a solo workspace's one business, with Choose plan while no
 * plan is open; the count to buy before an agency's first Checkout; the slots to change on a
 * running plan, whose period ends at the renewal; or the one sentence that says why they cannot
 * change now. Dates travel as ISO strings, since the control is a client component.
 */
export type SlotsState =
  | { phase: 'solo'; checkout: boolean }
  | { phase: 'checkout'; clientCount: number }
  | {
      phase: 'change'
      clientCount: number
      ordered: number
      paid: number
      period: { start: string; end: string }
      timezone: string
    }
  | { phase: 'unavailable'; sentence: string }

/**
 * The slot control's state for the settings page, from the row and count it already read: nothing
 * on house; a solo workspace's one business; Checkout's count while no subscription is open;
 * otherwise a change, unless `slotsUnavailable` (src/lib/billing/copy.ts) says why not. A row it
 * allows always carries its period — a paid row without a period start is locked, and
 * `applySubscriptionSnapshot` writes start and end together — so the period check only narrows the
 * types.
 */
export function slotsStateOf(
  entitlement: Entitlement,
  row: Pick<AgencyBillingColumns, 'current_period_start' | 'current_period_end'>,
  clientCount: number,
  now: Date
): SlotsState | null {
  if (entitlement.plan === 'house') return null
  if (entitlement.mode === 'solo') return { phase: 'solo', checkout: !entitlement.subscriptionOpen }
  if (!entitlement.subscriptionOpen) return { phase: 'checkout', clientCount }
  const sentence = slotsUnavailable(entitlement, now)
  if (sentence) return { phase: 'unavailable', sentence }
  const { current_period_start: start, current_period_end: end } = row
  if (!start || !end) return null
  return {
    phase: 'change',
    clientCount,
    ordered: entitlement.brands,
    paid: entitlement.brandsPaid,
    period: { start, end },
    timezone: entitlement.timezone,
  }
}

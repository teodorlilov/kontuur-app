'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { openBillingPortal, startCheckout } from '@/features/settings/actions/billing-actions'
import { PlanEndControl } from '@/features/settings/components/plan-end-control'
import type { ActionResult } from '@/lib/actions/types'
import type { PlanId } from '@/lib/billing/plans'

interface PlanActionsProps {
  plan: PlanId
  /** Whether a Stripe subscription is open (`Entitlement.subscriptionOpen`), whatever the state. */
  subscriptionOpen: boolean
  /** What choosing the plan bills, worded on the server by `checkoutSummary` (src/lib/billing/copy.ts). */
  summary: string
  /** Whether the open subscription is already set to end (`Entitlement.planEnding`) — picks Cancel plan or Keep plan. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`). */
  cancelConsequence: string
}

/**
 * The plan panel's actions, decided by the subscription rather than the state. While one is open
 * — active, in its grace, paused after its renewal failed, or on a house workspace — the plan's
 * end (`PlanEndControl`; cancelling never leaves the app) and "Manage billing" (card, address and
 * tax ID in Stripe's portal); a second Checkout would charge twice. With none, "Choose plan" —
 * on the trial, in its grace, or after a plan ended, where re-subscribing is a fresh Checkout —
 * and nothing on a house workspace, which buys nothing. The Stripe buttons call their server
 * action and follow the URL it hands back. What happens when Checkout sends the admin back is
 * `CheckoutReturn`'s, under the tabs.
 */
export function PlanActions({
  plan,
  subscriptionOpen,
  summary,
  ending,
  cancelConsequence,
}: PlanActionsProps) {
  const [busy, setBusy] = useState(false)

  async function follow(action: () => Promise<ActionResult<{ url: string }>>) {
    setBusy(true)
    const result = await action()
    if (!result.ok) {
      toast.error(result.error)
      setBusy(false)
      return
    }
    window.location.assign(result.data.url)
  }

  if (subscriptionOpen) {
    return (
      <div className="flex items-center justify-end gap-2 pt-4">
        <PlanEndControl ending={ending} consequence={cancelConsequence} />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void follow(openBillingPortal)}
        >
          Manage billing
        </Button>
      </div>
    )
  }

  if (plan === 'house') return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-caption text-text2">{summary}</p>
      <Button loading={busy} onClick={() => void follow(startCheckout)}>
        Choose plan
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { openBillingPortal, startCheckout } from '@/features/settings/actions/billing-actions'
import { PlanEndControl } from '@/features/settings/components/plan-end-control'
import type { ActionResult } from '@/lib/actions/types'
import { isPaying, type EntitlementState } from '@/lib/billing/entitlement'
import type { PlanId } from '@/lib/billing/plans'

interface PlanActionsProps {
  state: EntitlementState
  plan: PlanId
  /** What choosing the plan bills, worded by copy.ts on the server: "€19.00 a month per client · 3 clients today". */
  summary: string
  /** Whether a paid plan is already set to end (`Entitlement.endsOn`) — picks Cancel plan or Keep plan. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`). */
  cancelConsequence: string
}

/**
 * The plan panel's actions: "Choose plan" while the workspace does not pay (trial, grace, or
 * paused — a re-subscription is a fresh Checkout); "Manage billing" (card, address, tax ID in
 * Stripe's portal) and the plan's own end (`PlanEndControl` — cancelling never leaves the app)
 * while it does; nothing on a house workspace. The Stripe buttons call their server action and
 * follow the URL it hands back. What happens when Checkout sends the admin back is
 * `CheckoutReturn`'s, under the tabs.
 */
export function PlanActions({ state, plan, summary, ending, cancelConsequence }: PlanActionsProps) {
  const [busy, setBusy] = useState(false)
  const paid = isPaying({ plan, state })

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

  if (plan === 'house') return null

  if (paid) {
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-caption text-text2">{summary}</p>
      <Button loading={busy} onClick={() => void follow(startCheckout)}>
        Choose plan
      </Button>
    </div>
  )
}

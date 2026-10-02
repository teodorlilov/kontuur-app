'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { openBillingPortal, startCheckout } from '@/features/settings/actions/billing-actions'
import { ClientSlotsControl } from '@/features/settings/components/client-slots-control'
import { PlanEndControl } from '@/features/settings/components/plan-end-control'
import type { SlotsState } from '@/features/settings/lib/slots-state'
import { MANAGE_BILLING } from '@/lib/billing/copy'
import type { ActionResult } from '@/lib/actions/types'

interface PlanActionsProps {
  /** Whether a Stripe subscription is open (`Entitlement.subscriptionOpen`), whatever the state. */
  subscriptionOpen: boolean
  /** Whether the open subscription is already set to end (`Entitlement.planEnding`) — picks Cancel plan or Keep plan. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`). */
  cancelConsequence: string
  /** The slot control's state (`slotsStateOf`, src/features/settings/lib/slots-state.ts); null on house. */
  slots: SlotsState | null
}

/**
 * The plan panel's actions. The client slots come first (`ClientSlotsControl`): the count Checkout
 * sells while no subscription is open — on the trial, in its grace, or after a plan ended — and the
 * slots to change while one runs; a house workspace has none. While a subscription is open —
 * active, in its grace, paused after its renewal failed, or on a house workspace — the plan's end
 * (`PlanEndControl`; cancelling never leaves the app) and "Manage billing" (card, address and tax
 * ID in Stripe's portal) follow; a second Checkout would charge twice. Both Stripe buttons go
 * through `follow`, which calls the server action and goes to the URL it hands back. What happens
 * when Checkout sends the admin back is `CheckoutReturn`'s, under the tabs.
 */
export function PlanActions({
  subscriptionOpen,
  ending,
  cancelConsequence,
  slots,
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

  const slotControl = slots && (
    <ClientSlotsControl
      key={slots.phase === 'change' ? slots.ordered : slots.phase}
      state={slots}
      checkout={{ busy, start: (count) => void follow(() => startCheckout(count)) }}
    />
  )

  if (!subscriptionOpen) return slotControl

  return (
    <>
      {slotControl}
      <div className="flex items-center justify-end gap-2 pt-4">
        <PlanEndControl ending={ending} consequence={cancelConsequence} />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void follow(openBillingPortal)}
        >
          {MANAGE_BILLING}
        </Button>
      </div>
    </>
  )
}

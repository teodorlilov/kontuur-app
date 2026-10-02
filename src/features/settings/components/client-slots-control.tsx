'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Stepper } from '@/components/ui/stepper'
import { toast } from '@/components/ui/toast'
import { setClientSlotsAction } from '@/features/settings/actions/billing-actions'
import type { SlotsState } from '@/features/settings/lib/slots-state'
import {
  SLOTS_CONTROL,
  slotChangeConsequence,
  slotsChanged,
  slotsHint,
  slotsPendingLower,
  slotsSummary,
} from '@/lib/billing/copy'
import { MAX_CLIENT_SLOTS, billableQuantity } from '@/lib/billing/plans'

/** Checkout, started by the plan panel (`PlanActions`), which follows the URL it hands back. */
interface Checkout {
  busy: boolean
  start: (slots: number) => void
}

interface ClientSlotsControlProps {
  state: SlotsState
  checkout: Checkout
}

/**
 * The one place the number of clients paid for is chosen (docs/plans/CLIENT-SLOTS.md): before a
 * first Checkout, the count Checkout sells; on a running plan, the client slots, changed behind a
 * confirm that says what is charged. A solo workspace always pays for its one business, so it sees
 * the price and, before a first Checkout, Choose plan. A plan that cannot change now says why.
 */
export function ClientSlotsControl({ state, checkout }: ClientSlotsControlProps) {
  if (state.phase === 'solo') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="text-caption text-text2">{slotsSummary('solo', 1)}</p>
        {state.checkout && (
          <Button loading={checkout.busy} onClick={() => checkout.start(1)}>
            {SLOTS_CONTROL.choose}
          </Button>
        )}
      </div>
    )
  }
  if (state.phase === 'unavailable') {
    return <p className="pt-4 text-caption text-text2">{state.sentence}</p>
  }
  return <SlotCount state={state} checkout={checkout} />
}

/**
 * The stepper and what it costs. Before a first Checkout the number goes to Checkout; on a running
 * plan "Change" opens the confirm, worked out on the click — never in the server render — so the
 * estimate uses this moment's clock. A period that ran out while the page stood open is never
 * priced: the click refreshes the page instead, and the server render (`slotsStateOf`) shows the
 * renewal still being paid or the new period. The request carries the period the confirm was
 * priced on, which the action holds against the row (`setClientSlotsAction`). No refresh after a
 * change: the snapshot's cache bust re-renders the page into the action's response
 * (`applySubscriptionSnapshot`, src/lib/billing/subscription-store.ts), and the plan panel
 * remounts this on the new count. The stepper never stops between the slots held and the clients
 * held: from a workspace holding more clients than slots, one step up goes straight to the count
 * its clients need.
 */
function SlotCount({
  state,
  checkout,
}: {
  state: Extract<SlotsState, { phase: 'checkout' | 'change' }>
  checkout: Checkout
}) {
  const router = useRouter()
  const ordered = state.phase === 'change' ? state.ordered : null
  const floor = billableQuantity(state.clientCount)
  const [count, setCount] = useState(ordered ?? floor)
  const [confirm, setConfirm] = useState<ReturnType<typeof slotChangeConsequence> | null>(null)
  const [busy, setBusy] = useState(false)

  function openConfirm() {
    if (state.phase !== 'change') return
    if (Date.now() >= Date.parse(state.period.end)) {
      router.refresh()
      return
    }
    setConfirm(
      slotChangeConsequence({
        from: state.ordered,
        to: count,
        paid: state.paid,
        period: { start: new Date(state.period.start), end: new Date(state.period.end) },
        timezone: state.timezone,
        now: new Date(),
      })
    )
  }

  async function submit() {
    if (state.phase !== 'change') return
    setBusy(true)
    const result = await setClientSlotsAction({
      from: state.ordered,
      to: count,
      periodStart: state.period.start,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setConfirm(null)
    toast.success(slotsChanged(result.data.outcome, count, state.paid))
  }

  const hint = slotsHint(state.phase, count, state.clientCount)
  const pendingLower =
    state.phase === 'change' && state.ordered < state.paid
      ? slotsPendingLower(state.paid, state.ordered, new Date(state.period.end), state.timezone)
      : null

  return (
    <div className="flex flex-col gap-2.5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b className="block text-body font-semibold text-ink">
            {ordered === null ? SLOTS_CONTROL.beforeLabel : SLOTS_CONTROL.afterLabel}
          </b>
          <p className="text-caption text-text2">{SLOTS_CONTROL.help}</p>
        </div>
        <Stepper
          value={count}
          min={floor}
          max={Math.max(MAX_CLIENT_SLOTS, ordered ?? 0)}
          decrementLabel={SLOTS_CONTROL.fewer}
          incrementLabel={SLOTS_CONTROL.more}
          onChange={(next) => setCount(Math.max(next, floor))}
        />
      </div>
      {hint && <p className="text-caption text-text3">{hint}</p>}
      {pendingLower && (
        <p className="rounded-md bg-wash px-3 py-2 text-caption text-text2">{pendingLower}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption tabular-nums text-text2">{slotsSummary('agency', count)}</p>
        {ordered === null ? (
          <Button loading={checkout.busy} onClick={() => checkout.start(count)}>
            {SLOTS_CONTROL.choose}
          </Button>
        ) : (
          count !== ordered && (
            <Button size="sm" onClick={openConfirm}>
              {SLOTS_CONTROL.change}
            </Button>
          )
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          confirmLabel={confirm.confirm}
          cancelLabel={confirm.cancel}
          tone="primary"
          loading={busy}
          onConfirm={() => void submit()}
          onClose={() => setConfirm(null)}
        >
          {confirm.body}
        </ConfirmDialog>
      )}
    </div>
  )
}

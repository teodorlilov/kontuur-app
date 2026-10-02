'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { setPlanEndingAction } from '@/features/settings/actions/billing-actions'
import { PLAN_END, planEndingChanged } from '@/lib/billing/copy'

interface PlanEndControlProps {
  /** Whether the plan is already set to end — decides which of the two buttons this is. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`); shown before confirming. */
  consequence: string
}

/**
 * The plan's end, from inside the app: "Cancel plan" behind a confirm that says when it ends and
 * what happens then, or "Keep plan" when it is already ending — one click, nothing to confirm,
 * since keeping costs nothing. A plan whose renewal failed ends at once rather than with its
 * period (`setPlanEndingAction`), and the toast says which happened. No refresh is asked for: the
 * action's row write busts the agency cache with `{ expire: 0 }` (`applySubscriptionSnapshot`),
 * which makes the action's own response carry the re-rendered page, so the shell banner, the plan
 * panel and the danger zone show the new state with it. Rendered by the plan panel alone: the
 * danger zone's refusal names it rather than repeating it.
 */
export function PlanEndControl({ ending, consequence }: PlanEndControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(nextEnding: boolean) {
    setBusy(true)
    const result = await setPlanEndingAction(nextEnding)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setConfirming(false)
    toast.success(planEndingChanged(result.data.endedNow, nextEnding))
  }

  if (ending) {
    return (
      <Button variant="secondary" size="sm" loading={busy} onClick={() => void submit(false)}>
        {PLAN_END.keep}
      </Button>
    )
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        {PLAN_END.cancel}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={PLAN_END.confirmTitle}
        confirmLabel={PLAN_END.cancel}
        cancelLabel={PLAN_END.stay}
        loading={busy}
        onConfirm={() => void submit(true)}
        onClose={() => setConfirming(false)}
      >
        {consequence}
      </ConfirmDialog>
    </>
  )
}

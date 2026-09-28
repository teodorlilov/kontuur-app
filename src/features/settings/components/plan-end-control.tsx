'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { setPlanEndingAction } from '@/features/settings/actions/billing-actions'

interface PlanEndControlProps {
  /** Whether the plan is already set to end — decides which of the two buttons this is. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`); shown before confirming. */
  consequence: string
  className?: string
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
export function PlanEndControl({ ending, consequence, className }: PlanEndControlProps) {
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
    toast.success(
      result.data.endedNow
        ? 'Your plan has ended.'
        : nextEnding
          ? 'Your plan is set to end.'
          : 'Your plan continues.'
    )
  }

  if (ending) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={className}
        loading={busy}
        onClick={() => void submit(false)}
      >
        Keep plan
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => setConfirming(true)}
      >
        Cancel plan
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Cancel your plan"
        confirmLabel="Cancel plan"
        cancelLabel="Keep it"
        loading={busy}
        onConfirm={() => void submit(true)}
        onClose={() => setConfirming(false)}
      >
        {consequence}
      </ConfirmDialog>
    </>
  )
}

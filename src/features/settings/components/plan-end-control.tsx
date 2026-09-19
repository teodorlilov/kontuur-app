'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
 * since keeping costs nothing. Both refresh the page afterwards: the row was written by the
 * action, so the shell banner, the plan panel and the danger zone all show the new state at once.
 * Rendered by the plan panel and by the danger zone's refusal, so cancelling is one control.
 */
export function PlanEndControl({ ending, consequence, className }: PlanEndControlProps) {
  const router = useRouter()
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
    toast.success(nextEnding ? 'Your plan is set to end.' : 'Your plan continues.')
    router.refresh()
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

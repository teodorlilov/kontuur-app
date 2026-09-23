'use client'

import { useState } from 'react'
import { Wordmark } from '@/components/layout/wordmark'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FlowStepper, type FlowStep } from './flow-stepper'

interface FlowChromeProps {
  step: FlowStep
  isGenerating: boolean
  onStepOneClick: () => void
  /** Leave the flow; a run still streaming is stopped first. */
  onCancelConfirmed: () => void
}

/**
 * The flow's only chrome: wordmark, the three-step rail, and the exit.
 * Drafts are rows the moment they stream, so leaving loses none of them — they
 * wait on Generate — and the exit says so: a quiet "Back to dashboard" on setup
 * and review. Only a run still streaming is worth a red button and a confirm:
 * leaving stops it, and what has not landed yet may never. The wordmark is the
 * same exit — it links to the dashboard but never navigates on its own, because
 * a plain link would skip the abort `onCancelConfirmed` does. At `done` the
 * button is gone and the wordmark is the way out.
 */
export function FlowChrome({
  step,
  isGenerating,
  onStepOneClick,
  onCancelConfirmed,
}: FlowChromeProps) {
  const [confirming, setConfirming] = useState(false)

  function requestLeave() {
    if (isGenerating) setConfirming(true)
    else onCancelConfirmed()
  }

  return (
    <header className="flex flex-none items-center gap-6 border-b border-line bg-paper/[0.88] px-4 py-3 backdrop-blur-sm md:px-8">
      <Wordmark
        href="/dashboard"
        onClick={(event) => {
          event.preventDefault()
          requestLeave()
        }}
      />
      <FlowStepper step={step} onStepOneClick={onStepOneClick} />
      {step !== 'done' &&
        (isGenerating ? (
          <Button
            variant="danger"
            size="sm"
            // The exit reads as a quiet ghost until approached — a bordered danger
            // button in the chrome would shout on every screen of the flow.
            className="border-transparent"
            onClick={requestLeave}
          >
            Stop run
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={requestLeave}>
            Back to dashboard
          </Button>
        ))}

      <ConfirmDialog
        open={confirming}
        title="Stop this run?"
        confirmLabel="Stop and leave"
        cancelLabel="Keep working"
        onConfirm={() => {
          setConfirming(false)
          onCancelConfirmed()
        }}
        onClose={() => setConfirming(false)}
      >
        This run is still going. Drafts written so far are kept and wait for you on Generate;
        anything still being written may be lost.
      </ConfirmDialog>
    </header>
  )
}

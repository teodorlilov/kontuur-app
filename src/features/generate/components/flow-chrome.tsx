'use client'

import { useState } from 'react'
import { Wordmark } from '@/components/layout/wordmark'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FlowStepper, type FlowStep } from './flow-stepper'

interface FlowChromeProps {
  step: FlowStep
  /** Drafts not yet approved or discarded — decides the confirm dialog's copy. */
  liveDraftCount: number
  isGenerating: boolean
  onStepOneClick: () => void
  /** Leave the flow, discarding whatever the confirm dialog warned about. */
  onCancelConfirmed: () => void
}

/**
 * The flow's only chrome: wordmark, the three-step rail, and the one exit.
 * Leaving mid-run discards unsaved drafts, so the exit is a danger action and
 * confirms before anything is lost; from a clean setup it just leaves.
 */
export function FlowChrome({
  step,
  liveDraftCount,
  isGenerating,
  onStepOneClick,
  onCancelConfirmed,
}: FlowChromeProps) {
  const [confirming, setConfirming] = useState(false)
  const hasWorkToLose = liveDraftCount > 0 || isGenerating

  return (
    <header className="flex flex-none items-center gap-6 border-b border-line bg-paper/[0.88] px-4 py-3 backdrop-blur-sm md:px-8">
      <Wordmark />
      <FlowStepper step={step} onStepOneClick={onStepOneClick} />
      {step !== 'done' && (
        <Button
          variant="danger"
          size="sm"
          // The exit reads as a quiet ghost until approached — a bordered danger
          // button in the chrome would shout on every screen of the flow.
          className="border-transparent"
          onClick={() => (hasWorkToLose ? setConfirming(true) : onCancelConfirmed())}
        >
          Cancel run
        </Button>
      )}

      <ConfirmDialog
        open={confirming}
        title="Discard this run?"
        confirmLabel="Discard and leave"
        cancelLabel="Keep working"
        onConfirm={() => {
          setConfirming(false)
          onCancelConfirmed()
        }}
        onClose={() => setConfirming(false)}
      >
        {liveDraftCount > 0
          ? `${liveDraftCount} draft${liveDraftCount === 1 ? '' : 's'} generated so far ${liveDraftCount === 1 ? 'is' : 'are'} not saved yet. Leaving now discards ${liveDraftCount === 1 ? 'it' : 'them'}, along with the visuals composed for ${liveDraftCount === 1 ? 'it' : 'them'}.`
          : 'This run is still going. Leaving now stops it — nothing generated so far is saved.'}
      </ConfirmDialog>
    </header>
  )
}

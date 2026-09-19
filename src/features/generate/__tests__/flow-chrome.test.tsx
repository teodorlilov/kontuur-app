import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlowChrome } from '../components/flow-chrome'
import type { FlowStep } from '../components/flow-stepper'

/**
 * The chrome's two exits are one exit: the wordmark and "Cancel run" both go through
 * `onCancelConfirmed`, confirming first only while there is work to lose. Pinned because
 * the wordmark is a real link to the dashboard, and a link that navigated on its own
 * would skip the abort and visual cleanup the flow does on the way out.
 */
function renderChrome(
  over: Partial<{ step: FlowStep; liveDraftCount: number; isGenerating: boolean }> = {}
) {
  const onCancelConfirmed = vi.fn()
  render(
    <FlowChrome
      step="setup"
      liveDraftCount={0}
      isGenerating={false}
      onStepOneClick={vi.fn()}
      onCancelConfirmed={onCancelConfirmed}
      {...over}
    />
  )
  return { onCancelConfirmed }
}

describe('FlowChrome', () => {
  it('links the wordmark to the dashboard and leaves through the flow, not the link', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome()

    const wordmark = screen.getByRole('link', { name: /kontuur/i })
    expect(wordmark).toHaveAttribute('href', '/dashboard')
    await user.click(wordmark)
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })

  it('confirms before the wordmark leaves a run with unsaved drafts', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome({ step: 'review', liveDraftCount: 2 })

    await user.click(screen.getByRole('link', { name: /kontuur/i }))
    expect(onCancelConfirmed).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Discard this run?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })

  it('drops Cancel run at done and keeps the wordmark as the way out', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome({ step: 'done' })

    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /kontuur/i }))
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })
})

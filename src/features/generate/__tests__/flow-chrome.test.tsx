import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlowChrome } from '../components/flow-chrome'
import type { FlowStep } from '../components/flow-stepper'

/**
 * The chrome's two exits are one exit: the wordmark and the exit button both go through
 * `onCancelConfirmed`, confirming first only while a run is still streaming — drafts are
 * rows, so a review with drafts waiting leaves silently. Pinned because the wordmark is a
 * real link to the dashboard, and a link that navigated on its own would skip the abort the
 * flow does on the way out.
 */
function renderChrome(over: Partial<{ step: FlowStep; isGenerating: boolean }> = {}) {
  const onCancelConfirmed = vi.fn()
  render(
    <FlowChrome
      step="setup"
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

  it('confirms before the wordmark leaves a run that is still streaming', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome({ step: 'generating', isGenerating: true })

    await user.click(screen.getByRole('link', { name: /kontuur/i }))
    expect(onCancelConfirmed).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Stop this run?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop and leave' }))
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })

  it('leaves a review through a plain "Back to dashboard" — the drafts there are rows, nothing is lost', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome({ step: 'review' })

    expect(screen.queryByRole('button', { name: 'Stop run' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to dashboard' }))
    expect(screen.queryByRole('heading', { name: 'Stop this run?' })).not.toBeInTheDocument()
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })

  it('names the exit "Stop run" only while a run is streaming', () => {
    renderChrome({ step: 'generating', isGenerating: true })
    expect(screen.getByRole('button', { name: 'Stop run' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to dashboard' })).not.toBeInTheDocument()
  })

  it('drops the exit button at done and keeps the wordmark as the way out', async () => {
    const user = userEvent.setup()
    const { onCancelConfirmed } = renderChrome({ step: 'done' })

    expect(screen.queryByRole('button', { name: 'Back to dashboard' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /kontuur/i }))
    expect(onCancelConfirmed).toHaveBeenCalledTimes(1)
  })
})

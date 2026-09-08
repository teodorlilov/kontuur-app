import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleDialog } from '../schedule-dialog'

/**
 * Approve is also the moment a post gets a slot, and this dialog is where the two decisions meet.
 *
 * It used to lead with two recommendations — a "next open slot" and a "best time" — both derived
 * from `brand_profiles.best_time_json`. That column was removed (migration 20260848) once
 * measurement showed only its hour axis was real, so what is left has to be checked for the thing
 * that replaced them: a manual pick that resolves in the AGENCY's zone, not the runtime's. Getting
 * that wrong writes a `scheduled_at` at the wrong instant, silently, on every schedule.
 */

function renderDialog(props: Partial<React.ComponentProps<typeof ScheduleDialog>> = {}) {
  const onConfirm = vi.fn()
  render(
    <ScheduleDialog
      open
      timeZone="Europe/Sofia"
      onConfirm={onConfirm}
      onClose={vi.fn()}
      {...props}
    />
  )
  return { onConfirm }
}

describe('ScheduleDialog', () => {
  it('offers a manual pick and no slot, and nothing that recommends one', () => {
    renderDialog()
    expect(screen.getByText('Pick a date & time')).toBeInTheDocument()
    expect(screen.getByText('Leave unscheduled')).toBeInTheDocument()
    expect(screen.queryByText(/best time/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/next open slot/i)).not.toBeInTheDocument()
  })

  it('defaults to leaving the post unscheduled', async () => {
    const { onConfirm } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onConfirm).toHaveBeenCalledWith(null)
  })

  it('resolves a picked date in the agency zone, not the runtime', async () => {
    // 09:00 in Sofia is 06:00Z in September. Resolving in the browser's zone is the bug the
    // required `timeZone` prop exists to close.
    const { onConfirm } = renderDialog()
    await userEvent.click(screen.getByText('Pick a date & time'))
    await userEvent.type(screen.getByLabelText('Date'), '2026-09-10')
    await userEvent.type(screen.getByLabelText('Time'), '09:00')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onConfirm).toHaveBeenCalledWith('2026-09-10T06:00:00.000Z')
  })

  it('preselects the manual pick on the date a priority brief asked for', () => {
    // Mounted closed and then opened, which is how the queue uses it: the choice is reset on
    // the open TRANSITION, so a dialog rendered already-open never runs it.
    const props = {
      timeZone: 'Europe/Sofia',
      requestedDate: '2026-09-12',
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    }
    const { rerender } = render(<ScheduleDialog open={false} {...props} />)
    rerender(<ScheduleDialog open {...props} />)
    // A date the client named is a commitment, so the dialog opens on it rather than on
    // "leave unscheduled".
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12')
  })
})

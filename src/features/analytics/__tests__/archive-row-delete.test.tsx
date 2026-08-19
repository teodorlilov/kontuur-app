import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveRowDelete } from '../components/archive-row-delete'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: (m: string) => toastError(m) },
}))

const deleteReport = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const.
vi.mock('../actions/report-actions', () => ({
  deleteReport: (id: string) => deleteReport(id),
}))

beforeEach(() => vi.clearAllMocks())

describe('ArchiveRowDelete', () => {
  it('deletes the report and refreshes the archive list', async () => {
    deleteReport.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    render(<ArchiveRowDelete reportId="r1" />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(deleteReport).toHaveBeenCalledWith('r1')
  })

  it('surfaces a failed delete and leaves the row alone', async () => {
    deleteReport.mockResolvedValue({ ok: false, error: 'Not found' })
    const user = userEvent.setup()
    render(<ArchiveRowDelete reportId="r1" />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not found'))
    expect(refresh).not.toHaveBeenCalled()
  })
})

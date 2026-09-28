import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from '../command-palette'

/**
 * What ⌘K offers in each mode.
 *
 * Agency pins today's list: the nav, one row per client, and the two actions. Solo is one
 * business, so its only route to that screen is the "My business" nav row — no per-client rows
 * (that would be the same screen twice) and no "Add client".
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

const CLIENTS = [{ id: 'c1', name: 'Acme' }]
const ALLOWED = { refusal: null, note: null, wayOut: true }

function rowNames() {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '')
}

describe('CommandPalette', () => {
  it('offers an agency its clients and the add-client action', () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        agencyMode="agency"
        clients={CLIENTS}
        addClient={ALLOWED}
      />
    )

    const rows = rowNames()
    expect(rows).toContainEqual(expect.stringContaining('AcmeClient settings'))
    expect(rows).toContainEqual(expect.stringContaining('Add client'))
    expect(rows).toContainEqual(expect.stringContaining('ClientsGo to'))
  })

  it('offers a solo owner one way to the business and no way to add another', () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        agencyMode="solo"
        clients={CLIENTS}
        addClient={ALLOWED}
      />
    )

    const rows = rowNames()
    expect(rows).toContainEqual(expect.stringContaining('My businessGo to'))
    expect(rows.filter((row) => row.includes('Acme'))).toEqual([])
    expect(rows.filter((row) => row.includes('Add client'))).toEqual([])
    expect(rows.filter((row) => row.includes('Client settings'))).toEqual([])
  })

  it('shows a refused Add client with its reason and follows it on neither a click nor Enter', () => {
    push.mockClear()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        agencyMode="agency"
        clients={CLIENTS}
        addClient={{ refusal: 'Choose a plan to add clients.', note: null, wayOut: true }}
      />
    )
    const row = screen.getByRole('button', { name: /Add client/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent('Choose a plan to add clients.')
    fireEvent.click(row)
    fireEvent.change(screen.getByPlaceholderText('Search clients, pages and actions…'), {
      target: { value: 'Add client' },
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('says what a new client costs on a paid workspace, and still opens the form', () => {
    push.mockClear()
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        agencyMode="agency"
        clients={CLIENTS}
        addClient={{
          refusal: null,
          note: 'Adds €29.00 a month excl. VAT, charged pro rata today.',
          wayOut: true,
        }}
      />
    )
    const row = screen.getByRole('button', { name: /Add client/ })
    expect(row).toHaveTextContent('Adds €29.00 a month excl. VAT, charged pro rata today.')
    fireEvent.click(row)
    expect(push).toHaveBeenCalledWith('/clients/new')
  })
})

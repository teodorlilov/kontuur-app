import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

function rowNames() {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '')
}

describe('CommandPalette', () => {
  it('offers an agency its clients and the add-client action', () => {
    render(<CommandPalette open onOpenChange={vi.fn()} agencyMode="agency" clients={CLIENTS} />)

    const rows = rowNames()
    expect(rows).toContainEqual(expect.stringContaining('AcmeClient settings'))
    expect(rows).toContainEqual(expect.stringContaining('Add client'))
    expect(rows).toContainEqual(expect.stringContaining('ClientsGo to'))
  })

  it('offers a solo owner one way to the business and no way to add another', () => {
    render(<CommandPalette open onOpenChange={vi.fn()} agencyMode="solo" clients={CLIENTS} />)

    const rows = rowNames()
    expect(rows).toContainEqual(expect.stringContaining('My businessGo to'))
    expect(rows.filter((row) => row.includes('Acme'))).toEqual([])
    expect(rows.filter((row) => row.includes('Add client'))).toEqual([])
    expect(rows.filter((row) => row.includes('Client settings'))).toEqual([])
  })
})

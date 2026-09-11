import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReconnectPrompt } from '../reconnect-prompt'
import type { RetiredConnectionCard } from '../../lib/retired-connections'

const card: RetiredConnectionCard = {
  clientId: 'c1',
  clientName: 'About Social Media',
  platform: 'instagram',
  networkLabel: 'Instagram',
  accountName: 'about.social.media',
  retiredAt: '2026-09-10T03:30:00Z',
  retiredOnLabel: 'Thursday 10 September',
  scheduledCount: 2,
  nextSlotLabel: 'Sunday 13 September, 10:00',
  reconnectHref: '/api/meta/connect?platform=instagram&client_id=c1',
}

beforeEach(() => window.localStorage.clear())

describe('ReconnectPrompt', () => {
  it('opens with the client, what happened, what stops, and a one-click reconnect', () => {
    render(<ReconnectPrompt cards={[card]} />)

    expect(screen.getByRole('dialog', { name: 'Instagram needs reconnecting' })).toBeInTheDocument()
    expect(screen.getByText('About Social Media')).toBeInTheDocument()
    expect(screen.getByText('@about.social.media')).toBeInTheDocument()
    expect(screen.getByText('Disconnected by Instagram')).toBeInTheDocument()
    expect(
      screen.getByText(/Instagram ended this login on Thursday 10 September/)
    ).toBeInTheDocument()
    expect(screen.getByText(/2 scheduled posts will fail/)).toBeInTheDocument()
    expect(screen.getByText('Next one Sunday 13 September, 10:00')).toBeInTheDocument()
    expect(screen.getByText(/Stopped on Thursday 10 September/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect Instagram' })).toHaveAttribute(
      'href',
      '/api/meta/connect?platform=instagram&client_id=c1'
    )
  })

  it('omits the publishing line when nothing is scheduled on that network', () => {
    render(<ReconnectPrompt cards={[{ ...card, scheduledCount: 0, nextSlotLabel: null }]} />)
    expect(screen.queryByText(/will fail/)).not.toBeInTheDocument()
  })

  it('"Not now" closes it and it stays closed for this retirement; a new one shows again', () => {
    const first = render(<ReconnectPrompt cards={[card]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()

    const second = render(<ReconnectPrompt cards={[card]} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    second.unmount()

    render(<ReconnectPrompt cards={[{ ...card, retiredAt: '2026-09-12T03:30:00Z' }]} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking Reconnect also counts as seen — the OAuth round trip must not reopen it', () => {
    const first = render(<ReconnectPrompt cards={[card]} />)
    fireEvent.click(screen.getByRole('link', { name: 'Reconnect Instagram' }))
    first.unmount()

    render(<ReconnectPrompt cards={[card]} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens when a retirement arrives as new props on an already-mounted instance', () => {
    const { rerender } = render(<ReconnectPrompt cards={[]} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<ReconnectPrompt cards={[card]} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the next card after one is dismissed', () => {
    const facebook: RetiredConnectionCard = {
      ...card,
      platform: 'facebook',
      networkLabel: 'Facebook',
      accountName: 'About Social Media',
      reconnectHref: '/api/meta/connect?platform=facebook&client_id=c1',
    }
    render(<ReconnectPrompt cards={[card, facebook]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.getByRole('dialog', { name: 'Facebook needs reconnecting' })).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to reconnect', () => {
    render(<ReconnectPrompt cards={[]} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mocks } = vi.hoisted(() => ({
  mocks: { connectFacebookPage: vi.fn(), refresh: vi.fn() },
}))
vi.mock('@/features/clients/actions/connection-actions', () => ({
  connectFacebookPage: mocks.connectFacebookPage,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { FacebookPageChooser } from '../facebook-page-chooser'
import type { FacebookPage } from '@/lib/meta/facebook-auth'

/**
 * The step Instagram does not have.
 *
 * Instagram's consent names the account it connects; Facebook's yields a token reaching every
 * Page the person administers, so connecting is two steps and this is the second. What matters
 * here is which Pages can be chosen — a Page someone administers but cannot post to has to be
 * refused, and refused visibly.
 */

function page(over: Partial<FacebookPage> = {}): FacebookPage {
  return {
    id: '659554973897366',
    name: 'Paired Socks',
    accessToken: 'page-token',
    category: 'Clothing store',
    canPublish: true,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.connectFacebookPage.mockResolvedValue({ ok: true, data: undefined })
})

describe('FacebookPageChooser', () => {
  it('connects the Page that was picked', async () => {
    render(
      <FacebookPageChooser
        clientId="client-1"
        pages={{ ok: true, data: [page()] }}
        onClose={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(mocks.connectFacebookPage).toHaveBeenCalledWith('client-1', '659554973897366')
  })

  it('offers a choice between several Pages', async () => {
    // The whole reason this screen exists: /me/accounts returns a list, so someone with two
    // Pages has to say which one this client publishes to.
    render(
      <FacebookPageChooser
        clientId="client-1"
        pages={{ ok: true, data: [page(), page({ id: '2', name: 'Second Page' })] }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Paired Socks')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /^connect$/i })[1]!)

    expect(mocks.connectFacebookPage).toHaveBeenCalledWith('client-1', '2')
  })

  it('shows a Page it cannot publish to, and refuses it', async () => {
    // Hidden, this reads as "my Page is missing" — a worse thing to debug than a Page that says
    // why it cannot be used. The grant, not the person's Page role, is what decides.
    render(
      <FacebookPageChooser
        clientId="client-1"
        pages={{ ok: true, data: [page({ canPublish: false })] }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/not given permission to post/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled()
  })

  it('says no Page was granted, rather than that none exists', () => {
    // The list comes from the grant now, so a ticked Page reaches this screen even when
    // /me/accounts stays silent about it. Empty therefore means nothing was ticked — telling
    // someone they administer no Pages sends them off to create one they already have.
    render(
      <FacebookPageChooser clientId="client-1" pages={{ ok: true, data: [] }} onClose={vi.fn()} />
    )

    expect(screen.getByText(/did not give kontuur access to any page/i)).toBeInTheDocument()
  })

  it('shows why the list could not be read, rather than an empty one', () => {
    // A dead token and an empty Page list are different problems. Collapsing the first into the
    // second is what this screen did, and it is the wrong thing to go and fix.
    render(
      <FacebookPageChooser
        clientId="client-1"
        pages={{ ok: false, error: 'Could not read your Facebook Pages' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/could not read your facebook pages/i)).toBeInTheDocument()
  })
})

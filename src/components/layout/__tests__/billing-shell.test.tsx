import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import { BillingBanner } from '../billing-banner'
import { BillingWall } from '../billing-wall'

describe('BillingBanner', () => {
  it('is a status line with the sentence and one way to the plan page', () => {
    render(<BillingBanner tone="warn" text="Your trial ends on 27 September — choose a plan." />)

    expect(screen.getByRole('status')).toHaveTextContent('Your trial ends on 27 September')
    expect(screen.getByRole('link', { name: 'Plan & billing' })).toHaveAttribute(
      'href',
      '/settings?tab=account'
    )
  })
})

describe('BillingWall', () => {
  it('renders the page untouched while the workspace may work', () => {
    render(
      <BillingWall locked={false}>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByText('the calendar')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workspace paused' })).not.toBeInTheDocument()
  })

  it('replaces the page with one card and one action when paused', () => {
    render(
      <BillingWall locked>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByRole('heading', { name: 'Workspace paused' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute(
      'href',
      '/settings?tab=account'
    )
    expect(screen.queryByText('the calendar')).not.toBeInTheDocument()
  })

  it('lets a paused workspace through to Settings, where the plan is chosen', () => {
    nav.pathname = '/settings'
    render(
      <BillingWall locked>
        <p>plan and billing</p>
      </BillingWall>
    )
    expect(screen.getByText('plan and billing')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workspace paused' })).not.toBeInTheDocument()
  })
})

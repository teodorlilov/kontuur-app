import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BriefingActions } from '../components/briefing-actions'

const ITEMS = [
  {
    network: 'instagram' as const,
    title: 'Feed grid moves to 3:4 for every account',
    source_url: 'https://about.instagram.com/blog/grid',
  },
  {
    network: 'facebook' as const,
    title: 'Reels ranking favours original video over reposts',
    source_url: 'https://about.fb.com/news/reels',
  },
]

function renderActions(over: Partial<Parameters<typeof BriefingActions>[0]> = {}) {
  return render(
    <BriefingActions items={ITEMS} weekLabel="Monday 7 September" isCurrentWeek {...over} />
  )
}

describe('BriefingActions', () => {
  it("opens the week's changes as rows and closes them again", async () => {
    const user = userEvent.setup()
    renderActions()

    const toggle = screen.getByRole('button', { name: /show updates/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Reels ranking favours original video over reposts')).toBeNull()

    await user.click(toggle)

    expect(screen.getByRole('button', { name: /hide updates/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText(/week of monday 7 september/i)).toBeInTheDocument()
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    expect(
      screen.getByText('Reels ranking favours original video over reposts')
    ).toBeInTheDocument()

    const source = screen.getByRole('link', { name: /about\.instagram\.com/ })
    expect(source).toHaveAttribute('href', 'https://about.instagram.com/blog/grid')
    expect(source).toHaveAttribute('target', '_blank')
    expect(source).toHaveAttribute('rel', 'noopener noreferrer')

    await user.click(screen.getByRole('button', { name: /hide updates/i }))

    expect(screen.queryByText('Reels ranking favours original video over reposts')).toBeNull()
  })

  it("says so when the brief on show is last week's", () => {
    renderActions({ isCurrentWeek: false })

    expect(screen.getByRole('button', { name: /show last week's updates/i })).toBeInTheDocument()
  })
})

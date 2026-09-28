import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CoverageRow } from '../components/coverage-row'
import { emptyWeek } from '@/lib/queries/week-coverage'

const EMPTY_ROW = {
  clientId: 'c1',
  name: 'Bakery Sofia',
  week: emptyWeek(),
  pendingCount: 0,
  tier: 0,
}

describe('CoverageRow — Generate on an empty week', () => {
  it('links to the wizard for the client while a run may start', () => {
    render(<CoverageRow {...EMPTY_ROW} generateRefusal={null} />)
    expect(screen.getByRole('link', { name: 'Generate →' })).toHaveAttribute(
      'href',
      '/generate?client=c1'
    )
  })

  it('is disabled where it stands, with the reason, when no run may start — never a link into a wizard that can only refuse', () => {
    render(<CoverageRow {...EMPTY_ROW} generateRefusal="Your workspace is paused." />)
    const refused = screen.getByRole('link', { name: /Generate →/ })
    expect(refused).toHaveAttribute('aria-disabled', 'true')
    expect(refused).not.toHaveAttribute('href')
    expect(refused).toHaveTextContent('Your workspace is paused.')
  })
})

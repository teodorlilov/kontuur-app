import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BriefingBar } from '../components/briefing-bar'
import { getMondayISO } from '@/utils/date-helpers'

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

describe('BriefingBar', () => {
  it('names the week as not yet written before the first brief exists', () => {
    render(<BriefingBar briefing={null} />)

    expect(screen.getByText('No brief yet — one is written every Monday.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls a quiet week a quiet week, with nothing to open', () => {
    render(<BriefingBar briefing={{ week_start: '2026-09-07', items: [] }} />)

    expect(
      screen.getByText('Nothing changed on Instagram or Facebook this week.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('leads with the first change and offers the rest behind one button', () => {
    render(<BriefingBar briefing={{ week_start: getMondayISO(new Date(), 'UTC'), items: ITEMS }} />)

    expect(screen.getByText('Feed grid moves to 3:4 for every account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show updates/i })).toBeInTheDocument()
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyWeekCard } from '../components/my-week-card'
import { buildMyWeekDays } from '../lib/my-week'
import { emptyWeek, type WeekDay } from '@/lib/queries/week-coverage'

const ZONE = 'Europe/Sofia'
const WEEK = '2026-09-07'

function renderWeek(
  week: WeekDay[],
  previews: Parameters<typeof buildMyWeekDays>[0]['previews'] = {}
) {
  const days = buildMyWeekDays({
    week,
    previews,
    weekStartISO: WEEK,
    timeZone: ZONE,
    todayIndex: 5,
  })
  return render(<MyWeekCard days={days} week={week} clientName="About Social Media" />)
}

describe('MyWeekCard', () => {
  it('shows seven dated columns with today marked and every open day plannable', () => {
    renderWeek(emptyWeek())

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /is open — plan a post/i })).toHaveLength(7)
    expect(screen.getByText('7 days open')).toBeInTheDocument()
    expect(screen.getByText('0 published, 0 scheduled, 7 open')).toBeInTheDocument()
  })

  it("links a day's post to the calendar and says when it is hiding more", () => {
    const week = emptyWeek()
    week[1] = { state: 'scheduled', postId: 'p1', at: '2026-09-08T07:30:00Z', count: 2 }
    week[3] = { state: 'published', postId: 'p3', at: '2026-09-10T15:00:00Z', count: 1 }
    renderWeek(week, {
      p1: { id: 'p1', caption: 'Three questions to ask first', imageUrl: null },
      p3: {
        id: 'p3',
        caption: 'Our new treatment room',
        imageUrl: 'https://x.supabase.co/img.jpg',
      },
    })

    const scheduled = screen.getByRole('link', { name: /Tue 8, scheduled 10:30: Three questions/ })
    expect(scheduled).toHaveAttribute('href', '/calendar?editPost=p1')
    expect(screen.getByText('+1 more')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Thu 10, published 18:00: Our new/ })).toHaveAttribute(
      'href',
      '/calendar?editPost=p3'
    )
    expect(screen.getAllByRole('link', { name: /is open — plan a post/i })).toHaveLength(5)
    expect(screen.getByText('5 days open')).toBeInTheDocument()
    expect(screen.getByText('1 published, 1 scheduled, 5 open')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open calendar/i })).toHaveAttribute(
      'href',
      '/calendar'
    )
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReachDay } from '../lib/instagram/build-report'
import { ReachTrend } from '../components/charts/reach-trend'

/** Mirrors the chart's own geometry so a test can aim at a specific day. */
const W = 1120
const PAD_X = 12

function day(date: string, overrides: Partial<ReachDay> = {}): ReachDay {
  // thenDate is the aligned previous-period day — 7 days back in this fixture.
  const thenDate = `2026-08-${String(Number(date.slice(8)) - 7).padStart(2, '0')}`
  return { date, now: 100, then: 80, thenDate, views: 150, posts: [], thenPosts: [], ...overrides }
}

/** 8 days; day index 2 (13 Aug) carries four publications. */
const DAYS: ReachDay[] = [
  day('2026-08-11'),
  day('2026-08-12'),
  day('2026-08-13', {
    now: 1840,
    views: 1898,
    posts: [
      {
        externalPostId: 'big',
        caption: 'Launch day\nrest',
        mediaType: 'CAROUSEL_ALBUM',
        reach: 900,
        interactions: null,
        follows: 3,
        missing: null,
      },
      {
        externalPostId: 'mid',
        caption: 'Second post',
        mediaType: 'IMAGE',
        reach: 200,
        interactions: null,
        follows: 0,
        missing: null,
      },
      // Published through Kontuur, later deleted from Instagram.
      {
        externalPostId: 'low',
        caption: 'Third post',
        mediaType: 'VIDEO',
        reach: null,
        interactions: null,
        follows: null,
        missing: 'removed',
      },
      {
        externalPostId: 'tail',
        caption: 'Fourth post',
        mediaType: 'IMAGE',
        reach: 10,
        interactions: null,
        follows: 0,
        missing: null,
      },
    ],
  }),
  day('2026-08-14'),
  day('2026-08-15'),
  day('2026-08-16'),
  day('2026-08-17'),
  day('2026-08-18'),
]

function hoverDay(container: HTMLElement, index: number): SVGSVGElement {
  const svg = container.querySelector('svg')!
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: W,
    height: 264,
    right: W,
    bottom: 264,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  const clientX = PAD_X + (index * (W - PAD_X * 2)) / (DAYS.length - 1)
  fireEvent.pointerMove(svg, { clientX, clientY: 120 })
  return svg
}

describe('ReachTrend', () => {
  it('pins publish days on the baseline', () => {
    const { container } = render(<ReachTrend days={DAYS} bestDay={null} />)
    // No hover and no best day: the only circle is the one publish pin.
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('raises the day card on hover: the pair, views, and the publications', () => {
    const { container } = render(<ReachTrend days={DAYS} bestDay={null} />)
    hoverDay(container, 2)

    expect(screen.getByText('1,840')).toBeInTheDocument()
    expect(screen.getByText('1,898')).toBeInTheDocument()
    expect(screen.getByText('Published this day')).toBeInTheDocument()
    expect(screen.getByText('Launch day')).toBeInTheDocument()
    expect(screen.getByText('900 reached · +3 follows')).toBeInTheDocument()
    // A post deleted from Instagram after publishing says so instead of a number.
    expect(screen.getByText('no longer on Instagram')).toBeInTheDocument()
    // Only three posts are named; the fourth defers to the table.
    expect(screen.queryByText('Fourth post')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more in the posts table below')).toBeInTheDocument()
  })

  it('names the network a post was removed from, and speaks the measure that network has', () => {
    // Facebook's shape: Meta's 2025-11-15 purge left Pages no per-post reach and no media-type
    // vocabulary, so every card here used to read "metrics after the next sync" about a number
    // that is never coming, under a chip claiming the post was a "single".
    const days = [...DAYS]
    days[2] = day('2026-08-13', {
      now: 1840,
      posts: [
        {
          externalPostId: 'fb-live',
          caption: 'A Page post',
          mediaType: null,
          reach: null,
          interactions: 42,
          follows: null,
          missing: null,
        },
        {
          externalPostId: 'fb-gone',
          caption: 'Deleted from the Page',
          mediaType: null,
          reach: null,
          interactions: null,
          follows: null,
          missing: 'removed',
        },
      ],
    })
    const { container } = render(<ReachTrend days={days} bestDay={null} networkLabel="Facebook" />)
    hoverDay(container, 2)

    expect(screen.getByText('42 interactions')).toBeInTheDocument()
    expect(screen.getByText('no longer on Facebook')).toBeInTheDocument()
    expect(screen.queryByText('no longer on Instagram')).not.toBeInTheDocument()
    expect(screen.queryByText(/metrics after the next sync/)).not.toBeInTheDocument()
  })

  it('files each window under its own date, so the comparison cannot be misread', () => {
    const days = [...DAYS]
    days[2] = day('2026-08-13', {
      now: 1840,
      then: 4068,
      views: 1898,
      thenPosts: [
        {
          externalPostId: 'prev',
          caption: 'Last week’s winner',
          mediaType: 'IMAGE',
          reach: 900,
          interactions: null,
          follows: 1,
          missing: null,
        },
      ],
    })
    const { container } = render(<ReachTrend days={days} bestDay={null} />)
    // The axis names the comparison window's dates before anyone hovers.
    expect(screen.getAllByText('6 Aug').length).toBeGreaterThan(0)
    hoverDay(container, 2)

    // The previous value is filed under 6 Aug — the day it actually came from.
    expect(screen.getAllByText('6 Aug').length).toBeGreaterThan(1)
    expect(screen.getByText('· previous period')).toBeInTheDocument()
    expect(screen.getByText('4,068')).toBeInTheDocument()
    expect(screen.getByText('Published that day')).toBeInTheDocument()
    expect(screen.getByText('Last week’s winner')).toBeInTheDocument()
  })

  it('pins the previous window’s posts on their own row', () => {
    const days = DAYS.map((entry) =>
      entry.date === '2026-08-15'
        ? {
            ...entry,
            thenPosts: [
              {
                externalPostId: 'p',
                caption: 'Earlier',
                mediaType: 'IMAGE',
                reach: 10,
                interactions: null,
                follows: 0,
                missing: null,
              },
            ],
          }
        : entry
    )
    const { container } = render(<ReachTrend days={days} bestDay={null} />)
    // One pin for this period's posts, one for the previous period's.
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })

  it('clears the day card when the pointer leaves', () => {
    const { container } = render(<ReachTrend days={DAYS} bestDay={null} />)
    const svg = hoverDay(container, 2)
    fireEvent.pointerLeave(svg)
    expect(screen.queryByText('Published this day')).not.toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReachDay } from '../lib/build-report'
import { ReachTrend } from '../components/reach-trend'

/** Mirrors the chart's own geometry so a test can aim at a specific day. */
const W = 1120
const PAD_X = 12

function day(date: string, overrides: Partial<ReachDay> = {}): ReachDay {
  return { date, now: 100, then: 80, views: 150, posts: [], ...overrides }
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
        igMediaId: 'big',
        caption: 'Launch day\nrest',
        mediaType: 'CAROUSEL_ALBUM',
        reach: 900,
        follows: 3,
      },
      { igMediaId: 'mid', caption: 'Second post', mediaType: 'IMAGE', reach: 200, follows: 0 },
      { igMediaId: 'low', caption: 'Third post', mediaType: 'VIDEO', reach: 90, follows: null },
      { igMediaId: 'tail', caption: 'Fourth post', mediaType: 'IMAGE', reach: 10, follows: 0 },
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
    // Only three posts are named; the fourth defers to the table.
    expect(screen.queryByText('Fourth post')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more in the posts table below')).toBeInTheDocument()
  })

  it('clears the day card when the pointer leaves', () => {
    const { container } = render(<ReachTrend days={DAYS} bestDay={null} />)
    const svg = hoverDay(container, 2)
    fireEvent.pointerLeave(svg)
    expect(screen.queryByText('Published this day')).not.toBeInTheDocument()
  })
})

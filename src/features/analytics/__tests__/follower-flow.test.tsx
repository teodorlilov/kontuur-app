import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FollowerFlowDay, FollowerSummary } from '../lib/build-report'
import { FollowerFlow } from '../components/follower-flow'

/** Mirrors the chart's own geometry so a test can aim at a specific day. */
const W = 560
const PAD_X = 8

function flowDay(date: string, overrides: Partial<FollowerFlowDay> = {}): FollowerFlowDay {
  return { date, gained: 2, lost: 1, posts: [], ...overrides }
}

/** 4 days; day index 1 carries the publish pin, day index 2 never synced. */
const DAYS: FollowerFlowDay[] = [
  flowDay('2026-08-15'),
  flowDay('2026-08-16', {
    gained: 12,
    lost: 2,
    posts: [
      {
        igMediaId: 'a',
        caption: 'Launch day\nrest',
        mediaType: 'IMAGE',
        reach: 200,
        follows: 4,
        missing: null,
      },
    ],
  }),
  flowDay('2026-08-17', { gained: null, lost: null }),
  flowDay('2026-08-18'),
]

const FOLLOWERS: FollowerSummary = {
  gained: { now: 118, then: 12, deltaPct: 883.3 },
  lost: { now: 13, then: 18, deltaPct: -27.8 },
  net: { now: 105, then: -6 },
  total: 940,
  series: [830, 840, null, 850],
  byDay: DAYS,
  fromPosts: 1,
  churnPct: 1.6,
}

function hoverDay(container: HTMLElement, index: number): SVGSVGElement {
  const svg = container.querySelector('svg')!
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: W,
    height: 208,
    right: W,
    bottom: 208,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  const step = (W - PAD_X * 2) / DAYS.length
  const clientX = PAD_X + index * step + step / 2
  fireEvent.pointerMove(svg, { clientX, clientY: 100 })
  return svg
}

describe('FollowerFlow', () => {
  it('headlines gained, lost and net with their last-period anchors', () => {
    render(<FollowerFlow followers={FOLLOWERS} />)
    expect(screen.getByText('118')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText('+105')).toBeInTheDocument()
    expect(screen.getByText('was 12 last period')).toBeInTheDocument()
    // Net prints signed on both sides of the comparison.
    expect(screen.getByText('was −6 last period')).toBeInTheDocument()
    // Attribution names who is doing the crediting, in the reader's terms.
    expect(
      screen.getByText(/Instagram credits 1 of these follows to your posts/)
    ).toBeInTheDocument()
  })

  it('pins publish days and raises the day card with the posts on hover', () => {
    const { container } = render(<FollowerFlow followers={FOLLOWERS} />)
    // The only circle is the one publish pin.
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    hoverDay(container, 1)
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(screen.getByText('−2')).toBeInTheDocument()
    expect(screen.getByText('Published this day')).toBeInTheDocument()
    expect(screen.getByText('Launch day')).toBeInTheDocument()
    expect(screen.getByText('200 reached · +4 follows')).toBeInTheDocument()
  })

  it('says no data for a day the API never answered, and clears on leave', () => {
    const { container } = render(<FollowerFlow followers={FOLLOWERS} />)
    const svg = hoverDay(container, 2)
    expect(screen.getAllByText('no data')).toHaveLength(2)
    fireEvent.pointerLeave(svg)
    expect(screen.queryByText('no data')).not.toBeInTheDocument()
  })
})

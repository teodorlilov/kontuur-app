import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FollowerFlowDay, FollowerSummary } from '../lib/instagram/build-report'
import { FollowerFlow } from '../components/charts/follower-flow'

/** follower-flow.tsx's own W and PAD.left — jsdom has no layout, so a hover has to be aimed. */
const W = 560
const PAD_X = 8

function flowDay(date: string, overrides: Partial<FollowerFlowDay> = {}): FollowerFlowDay {
  return { date, gained: 2, lost: 1, posts: [], ...overrides }
}

const DAYS: FollowerFlowDay[] = [
  flowDay('2026-08-15'),
  flowDay('2026-08-16', {
    gained: 12,
    lost: 2,
    posts: [
      {
        externalPostId: 'a',
        caption: 'Launch day\nrest',
        mediaType: 'IMAGE',
        reach: 200,
        interactions: null,
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
  it('says a fully measured period where nothing moved in a sentence instead of drawing an empty plot', () => {
    const quiet: FollowerSummary = {
      ...FOLLOWERS,
      gained: { now: 0, then: null, deltaPct: null },
      lost: { now: 0, then: null, deltaPct: null },
      net: { now: 0, then: null },
      fromPosts: null,
      churnPct: null,
      byDay: [
        flowDay('2026-09-04', { gained: 0, lost: 0 }),
        flowDay('2026-09-05', { gained: 0, lost: 0 }),
      ],
    }
    const { container } = render(<FollowerFlow followers={quiet} />)
    expect(screen.getByText('No follower gains or losses in this period.')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('names where the data begins when the window reaches past the first stored day, so unmeasured days never read as zeros', () => {
    const partial: FollowerSummary = {
      ...FOLLOWERS,
      gained: { now: 0, then: null, deltaPct: null },
      lost: { now: 0, then: null, deltaPct: null },
      net: { now: 0, then: null },
      fromPosts: null,
      churnPct: null,
      byDay: [
        flowDay('2026-06-08', { gained: null, lost: null }),
        flowDay('2026-08-08', { gained: 0, lost: 0 }),
        flowDay('2026-08-09', { gained: 0, lost: 0 }),
      ],
    }
    render(<FollowerFlow followers={partial} />)
    expect(
      screen.getByText(
        "No follower gains or losses in this period — the network's data here begins 8 Aug."
      )
    ).toBeInTheDocument()
  })

  it('headlines gained, lost and net with their last-period anchors, net’s anchor signed, and names who credits the follows', () => {
    render(<FollowerFlow followers={FOLLOWERS} />)
    expect(screen.getByText('118')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText('+105')).toBeInTheDocument()
    expect(screen.getByText('was 12 last period')).toBeInTheDocument()
    expect(screen.getByText('was −6 last period')).toBeInTheDocument()
    expect(
      screen.getByText(/Instagram credits 1 of these follows to your posts/)
    ).toBeInTheDocument()
  })

  it('pins the one publish day with one circle and raises the day card with its posts on hover', () => {
    const { container } = render(<FollowerFlow followers={FOLLOWERS} />)
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
